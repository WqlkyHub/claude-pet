// Parler au compagnon au micro, et l'entendre répondre avec une vraie voix.
// Tout se passe sur ton PC, gratuitement, sans rien envoyer ailleurs que ta
// question à Claude (comme quand tu l'écris) :
//   - ta voix devient du texte avec whisper.cpp (modèle « small », en français) ;
//   - sa réponse devient une voix avec Piper (voix française « Siwis »).
// Il ne répond à voix haute que quand tu lui as parlé au micro.
//
// Ces deux outils (≈ 290 Mo en tout) ne sont téléchargés qu'une fois, la
// première fois que tu appuies sur le micro, et seulement après ton accord :
// il te montre exactement quoi, d'où, et où ça va. Tout est rangé dans
// %APPDATA%\claude-pet\voix\ ; menu « Voix » → « Supprimer » pour tout enlever.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { app, dialog, ipcMain, net, session, BrowserWindow, shell } = require('electron');
const update = require('../update');

const PARTS = [
  {
    id: 'whisper',
    nom: 'whisper.cpp, pour comprendre ta voix (programme)',
    url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip',
    taille: 9, file: 'whisper.zip', unzipTo: 'whisper', check: path.join('whisper', 'Release', 'whisper-cli.exe'),
  },
  {
    id: 'whisper-model',
    nom: 'modèle de reconnaissance vocale « small » (multilingue, dont le français)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    taille: 190, file: 'ggml-small-q5_1.bin', check: 'ggml-small-q5_1.bin',
  },
  {
    id: 'piper',
    nom: 'Piper, pour parler (programme)',
    url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
    taille: 22, file: 'piper.zip', unzipTo: '.', check: path.join('piper', 'piper.exe'),
  },
  {
    id: 'piper-voice',
    nom: 'voix française « Siwis » pour Piper',
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx',
    taille: 63, file: 'fr_FR-siwis-medium.onnx', check: 'fr_FR-siwis-medium.onnx',
    extra: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json',
  },
];

const FAKE = process.env.CLAUDE_PET_VOICE_FAKE === '1'; // tests : pas de vrais outils

function dir() { return path.join(app.getPath('userData'), 'voix'); }
const missing = () => (FAKE ? [] : PARTS.filter((p) => !fs.existsSync(path.join(dir(), p.check))));

async function download(url, dest, onProgress) {
  const res = await net.fetch(url);
  if (!res.ok || !res.body) throw new Error(`téléchargement impossible (${res.status}) : ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const tmp = `${dest}.part`;
  const out = fs.createWriteStream(tmp);
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
    if (total) onProgress(got / total);
  }
  await new Promise((resolve, reject) => { out.end(resolve); out.on('error', reject); });
  fs.renameSync(tmp, dest);
}

function exec(cmd, args, { input, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim().split('\n').pop() || `code ${code}`))));
    child.stdin.end(input || '');
  });
}

// Un petit « bip » pour les tests (pas de vraie voix).
function fakeWav(text) {
  const rate = 16000;
  const n = Math.min(rate * 2, 2000 + text.length * 300);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 8) * 3000), 44 + i * 2);
  return buf;
}

module.exports = {
  name: 'voix',
  setup(pet) {
    // Le micro ne sert qu'au compagnon lui-même.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

    let installing = null;

    // S'assure que les outils sont là ; sinon demande ton accord et les télécharge.
    async function ensure() {
      const todo = missing();
      if (!todo.length) return true;
      if (installing) return installing;
      const win = BrowserWindow.getAllWindows()[0];
      const total = todo.reduce((s, p) => s + p.taille, 0);
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Claude Pet demande ton accord',
        message: `Pour t'écouter et te répondre à voix haute, je dois télécharger ${todo.length} éléments (≈ ${total} Mo). Je peux ?`,
        detail: `${todo.map((p) => `• ${p.nom} — ${p.taille} Mo\n   ${p.url}`).join('\n')}\n\n`
          + `Rangés dans : ${dir()}\nGratuits, open source, et tout fonctionne ensuite sans internet. `
          + 'Rien d\'autre n\'est installé ni modifié sur ton PC.',
        buttons: [`Télécharger (≈ ${total} Mo)`, 'Annuler'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) return false;
      installing = (async () => {
        try {
          fs.mkdirSync(dir(), { recursive: true });
          let done = 0;
          for (const p of todo) {
            const dest = path.join(dir(), p.file);
            await download(p.url, dest, (f) => {
              const pct = Math.round(((done + f * p.taille) / total) * 100);
              pet.send({ type: 'voice-status', status: `Je télécharge ma voix… ${pct} %` });
            });
            if (p.extra) await download(p.extra, path.join(dir(), path.basename(p.extra)), () => {});
            if (p.unzipTo) {
              fs.mkdirSync(path.join(dir(), p.unzipTo), { recursive: true });
              await update.unzip(dest, path.join(dir(), p.unzipTo));
              fs.rmSync(dest, { force: true });
            }
            done += p.taille;
          }
          pet.send({ type: 'voice-status', status: '' });
          return true;
        } catch (err) {
          pet.send({ type: 'voice-status', status: '' });
          pet.say(`Je n'ai pas pu télécharger ma voix : ${err.message}`, { duration: 8000 });
          return false;
        } finally {
          installing = null;
        }
      })();
      return installing;
    }

    ipcMain.handle('voice:ready', () => ensure());

    // Ta voix (WAV 16 kHz mono) → texte.
    ipcMain.handle('voice:transcribe', async (_e, wav) => {
      if (FAKE) return process.env.CLAUDE_PET_VOICE_TEXT || 'Bonjour, tu m\'entends ?';
      const file = path.join(os.tmpdir(), `claude-pet-micro-${Date.now()}.wav`);
      fs.writeFileSync(file, Buffer.from(wav));
      try {
        const cli = path.join(dir(), 'whisper', 'Release', 'whisper-cli.exe');
        const out = await exec(cli, ['-m', path.join(dir(), 'ggml-small-q5_1.bin'), '-l', 'fr', '-nt', '-np', '-f', file]);
        return out.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

    // Texte → sa voix (WAV).
    ipcMain.handle('voice:speak', async (_e, text) => {
      const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
      if (!clean) return null;
      if (FAKE) return fakeWav(clean);
      const file = path.join(os.tmpdir(), `claude-pet-voix-${Date.now()}.wav`);
      try {
        const piper = path.join(dir(), 'piper', 'piper.exe');
        await exec(piper, ['--model', path.join(dir(), 'fr_FR-siwis-medium.onnx'), '--output_file', file, '--sentence_silence', '0.2'],
          { input: `${clean}\n`, cwd: path.join(dir(), 'piper') });
        return fs.readFileSync(file);
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

    pet.addMenuItems(() => [{
      label: 'Voix',
      submenu: [
        { label: missing().length ? 'Voix : pas encore téléchargée (appuie sur le micro)' : 'Voix : prête', enabled: false },
        { label: 'Ouvrir le dossier de la voix', enabled: fs.existsSync(dir()), click: () => shell.openPath(dir()) },
        {
          label: 'Supprimer la voix et la reconnaissance vocale...',
          enabled: fs.existsSync(dir()),
          click: async () => {
            const win = BrowserWindow.getAllWindows()[0];
            const { response } = await dialog.showMessageBox(win, {
              type: 'question', title: 'Claude Pet demande ton accord', message: 'Je supprime ma voix et la reconnaissance vocale (≈ 290 Mo) ?',
              detail: dir(), buttons: ['Supprimer', 'Annuler'], defaultId: 1, cancelId: 1, noLink: true,
            });
            if (response === 0) fs.rmSync(dir(), { recursive: true, force: true });
          },
        },
      ],
    }]);
  },
};
