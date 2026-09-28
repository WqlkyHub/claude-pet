// Parler au compagnon au micro, et l'entendre répondre avec une vraie voix.
// Tout se passe sur ton PC, gratuitement, sans rien envoyer ailleurs que ta
// question à Claude (comme quand tu l'écris) :
//   - ta voix devient du texte avec whisper.cpp (modèle « small », en français) ;
//   - sa réponse devient une voix avec Supertonic 3 (10 voix au choix, menu
//     « Voix »), ou avec l'ancienne voix Piper « Siwis » si tu la préfères.
// Il ne répond à voix haute que quand tu lui as parlé au micro.
// Option (menu « Voix ») : l'appeler « hey Axo » ou « dis Axo », sans cliquer.
//
// Ces outils (≈ 350 Mo en tout) ne sont téléchargés qu'une fois, la
// première fois que tu appuies sur le micro, et seulement après ton accord :
// il te montre exactement quoi, d'où, et où ça va. Tout est rangé dans
// %APPDATA%\claude-pet\voix\ ; menu « Voix » → « Supprimer » pour tout enlever.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { app, dialog, ipcMain, net, session, BrowserWindow, shell } = require('electron');
const update = require('../update');

const EAR = [
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
];

// Supertonic 3 tourne avec sherpa-onnx (un programme, sans Python).
const SHERPA = process.platform === 'win32'
  ? 'sherpa-onnx-v1.13.8-win-x64-shared-MT-Release' : 'sherpa-onnx-v1.13.8-linux-x64-shared';
const SUPERTONIC = 'sherpa-onnx-supertonic-3-tts-int8-2026-05-11';
const SUPERTONIC_VOICES = [
  'Féminine 1, la plus aiguë', 'Féminine 2', 'Féminine 3', 'Féminine 4', 'Féminine 5, plus posée',
  'Masculine 1, la plus claire', 'Masculine 2, grave', 'Masculine 3, grave', 'Masculine 4', 'Masculine 5, la plus grave',
];

const VOICES = {
  supertonic: [
    {
      id: 'sherpa',
      nom: 'sherpa-onnx, pour parler (programme)',
      url: `https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/${SHERPA}.tar.bz2`,
      taille: 25, file: 'sherpa.tar.bz2', unzipTo: '.',
      check: path.join(SHERPA, 'bin', `sherpa-onnx-offline-tts${process.platform === 'win32' ? '.exe' : ''}`),
    },
    {
      id: 'supertonic',
      nom: 'voix Supertonic 3 (10 voix, dont le français)',
      url: `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${SUPERTONIC}.tar.bz2`,
      taille: 129, file: 'supertonic.tar.bz2', unzipTo: '.', check: path.join(SUPERTONIC, 'voice.bin'),
    },
  ],
  piper: [
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
  ],
};

// Pour l'appel « hey Axo » : un modèle plus léger et plus rapide, qui ne sert
// qu'à reconnaître son nom. Téléchargé seulement si tu actives l'option.
const WAKE_PART = {
  id: 'whisper-base',
  nom: 'petit modèle « base » pour reconnaître « hey Axo » (rapide)',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
  taille: 57, file: 'ggml-base-q5_1.bin', check: 'ggml-base-q5_1.bin',
};

// « hey Axo », « dis Axo », « et Axo »… et ce que whisper croit parfois entendre.
const WAKE = /\b(?:h?e[yi]|hé|he|et|ok|dis|dit|di|allo|coucou|salut)[\s,!.-]*(?:axo|axos|axel|axeau|axau|aksso|akso|haxo|axolotl|a xo|acso|axe? au)\b[\s,!.?-]*(.*)$/i;

// Renvoie { hit, reste } : reste = ce que tu as dit juste après son nom.
function matchWake(text) {
  const t = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(WAKE);
  if (!m) return { hit: false, reste: '' };
  // On reprend la suite dans le texte d'origine (avec ses accents).
  const words = String(text).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  const keep = m[1].trim() ? m[1].trim().split(' ').length : 0;
  const reste = keep ? words.slice(-keep).join(' ').replace(/^[\s,!.-]+/, '') : '';
  return { hit: true, reste: reste.length > 3 ? reste[0].toUpperCase() + reste.slice(1) : '' };
}

const FAKE = process.env.CLAUDE_PET_VOICE_FAKE === '1'; // tests : pas de vrais outils

function dir() { return path.join(app.getPath('userData'), 'voix'); }
const has = (p) => fs.existsSync(path.join(dir(), p.check));
const missing = (parts) => (FAKE ? [] : parts.filter((p) => !has(p)));

// Décompresse un .zip ou un .tar.bz2.
async function extract(file, dest) {
  if (file.endsWith('.tar.bz2') && process.platform !== 'win32') {
    await new Promise((resolve, reject) => {
      const t = spawn('tar', ['-xjf', file, '-C', dest], { stdio: 'ignore' });
      t.on('error', reject);
      t.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`tar a échoué (${c})`))));
    });
    return;
  }
  await update.unzip(file, dest); // Windows : tar.exe lit aussi les .tar.bz2
}

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

function exec(cmd, args, { input, cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
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
    const engine = () => (pet.settings.get('voiceEngine', 'supertonic') === 'piper' ? 'piper' : 'supertonic');
    const needed = ({ wake = false } = {}) => [...EAR, ...VOICES[engine()], ...(wake ? [WAKE_PART] : [])];

    // S'assure que les outils sont là ; sinon demande ton accord et les télécharge.
    async function ensure({ wake = false, voiceOnly = false } = {}) {
      const todo = missing(needed({ wake }));
      if (!todo.length) return true;
      if (installing) return installing;
      const win = BrowserWindow.getAllWindows()[0];
      const total = todo.reduce((s, p) => s + p.taille, 0);
      const why = voiceOnly ? 'Pour ma nouvelle voix' : wake ? 'Pour que tu puisses m\'appeler « hey Axo » et me parler' : 'Pour t\'écouter et te répondre à voix haute';
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Claude Pet demande ton accord',
        message: `${why}, je dois télécharger ${todo.length > 1 ? `${todo.length} éléments` : '1 élément'} (≈ ${total} Mo). Je peux ?`,
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
              await extract(dest, path.join(dir(), p.unzipTo));
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

    // Appel « hey Axo » : le micro reste ouvert, mais seules tes phrases courtes
    // sont écoutées, sur ton PC, pour y chercher son nom. Rien n'est gardé.
    const wakeOn = () => pet.settings.get('wakeWord', false);
    const sendWake = () => pet.send({ type: 'wake-word', on: Boolean(wakeOn() && !missing(needed({ wake: true })).length) });
    async function setWake(on) {
      if (on && !(await ensure({ wake: true }))) { pet.settings.set('wakeWord', false); sendWake(); return; }
      pet.settings.set('wakeWord', on);
      sendWake();
      pet.say(on ? 'Appelle-moi « hey Axo » ou « dis Axo », je t\'écoute !' : 'D\'accord, je n\'écoute plus mon nom.', { duration: 5000 });
    }
    const cute = () => pet.settings.get('voiceCute', false);
    const sendStyle = () => pet.send({ type: 'voice-style', cute: cute() });
    pet.bus.once('ready', () => setTimeout(() => { sendWake(); sendStyle(); }, 1500));

    ipcMain.handle('voice:wake-check', async (_e, wav) => {
      if (!wakeOn()) return { hit: false, reste: '' };
      if (FAKE) return matchWake(process.env.CLAUDE_PET_WAKE_TEXT || 'Hey Axo !');
      const file = path.join(os.tmpdir(), `claude-pet-appel-${Date.now()}.wav`);
      fs.writeFileSync(file, Buffer.from(wav));
      try {
        const cli = path.join(dir(), 'whisper', 'Release', 'whisper-cli.exe');
        const out = await exec(cli, ['-m', path.join(dir(), WAKE_PART.file), '-l', 'fr', '-nt', '-np',
          '--prompt', 'Hey Axo ! Dis Axo.', '-f', file]);
        return matchWake(out);
      } catch {
        return { hit: false, reste: '' };
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

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
    async function synthesize(text, out) {
      if (engine() === 'piper') {
        const piper = path.join(dir(), 'piper', 'piper.exe');
        await exec(piper, ['--model', path.join(dir(), 'fr_FR-siwis-medium.onnx'), '--output_file', out,
          '--sentence_silence', '0.2', '--length_scale', '0.9'], { input: `${text}\n`, cwd: path.join(dir(), 'piper') });
        return;
      }
      const m = (f) => path.join(dir(), SUPERTONIC, f);
      const bin = path.join(dir(), SHERPA, 'bin');
      const sid = Math.max(0, Math.min(9, Number(pet.settings.get('supertonicVoice', 0)) || 0));
      await exec(path.join(bin, VOICES.supertonic[0].check.split(path.sep).pop()), [
        `--supertonic-duration-predictor=${m('duration_predictor.int8.onnx')}`,
        `--supertonic-text-encoder=${m('text_encoder.int8.onnx')}`,
        `--supertonic-vector-estimator=${m('vector_estimator.int8.onnx')}`,
        `--supertonic-vocoder=${m('vocoder.int8.onnx')}`,
        `--supertonic-tts-json=${m('tts.json')}`,
        `--supertonic-unicode-indexer=${m('unicode_indexer.bin')}`,
        `--supertonic-voice-style=${m('voice.bin')}`,
        '--lang=fr', `--sid=${sid}`, '--speed=1.1', `--num-threads=${Math.min(4, os.cpus().length || 2)}`,
        `--output-filename=${out}`, text,
      ], { cwd: bin, env: process.platform === 'win32' ? undefined : { ...process.env, LD_LIBRARY_PATH: path.join(dir(), SHERPA, 'lib') } });
    }

    ipcMain.handle('voice:speak', async (_e, text) => {
      const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
      if (!clean) return null;
      if (FAKE && !VOICES[engine()].every(has)) return fakeWav(clean);
      const file = path.join(os.tmpdir(), `claude-pet-voix-${Date.now()}.wav`);
      try {
        await synthesize(clean, file);
        return fs.readFileSync(file);
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

    // Changer de voix : télécharge ce qu'il faut (après ton accord), puis te la fait entendre.
    async function tryVoice(changes) {
      const before = { voiceEngine: engine(), supertonicVoice: pet.settings.get('supertonicVoice', 0) };
      for (const [k, v] of Object.entries(changes)) pet.settings.set(k, v);
      if (!missing(VOICES[engine()]).length || await ensure({ voiceOnly: true })) {
        pet.send({ type: 'voice-sample', text: 'Coucou ! C\'est moi, ton petit compagnon. Tu aimes ma nouvelle voix ?' });
      } else {
        for (const [k, v] of Object.entries(before)) pet.settings.set(k, v);
      }
    }

    pet.addMenuItems(() => [{
      label: 'Voix',
      submenu: [
        { label: missing(needed()).length ? 'Voix : pas encore téléchargée (appuie sur le micro)' : 'Voix : prête', enabled: false },
        {
          label: 'Choisir ma voix (je te la fais entendre)',
          submenu: [
            ...SUPERTONIC_VOICES.map((nom, i) => ({
              label: nom, type: 'radio',
              checked: engine() === 'supertonic' && Number(pet.settings.get('supertonicVoice', 0)) === i,
              click: () => tryVoice({ voiceEngine: 'supertonic', supertonicVoice: i }),
            })),
            { type: 'separator' },
            { label: 'Ancienne voix (Piper « Siwis »)', type: 'radio', checked: engine() === 'piper', click: () => tryVoice({ voiceEngine: 'piper' }) },
          ],
        },
        {
          label: 'Voix de petite créature (plus aiguë)', type: 'checkbox', checked: cute(),
          click: (item) => {
            pet.settings.set('voiceCute', item.checked);
            sendStyle();
            pet.send({ type: 'voice-sample', text: item.checked ? 'Et comme ça, je suis plus mignon ?' : 'Je reprends ma voix normale.' });
          },
        },
        {
          label: 'M\'appeler « hey Axo » (micro toujours ouvert)', type: 'checkbox', checked: wakeOn(),
          click: (item) => setWake(item.checked),
        },
        { label: 'Ouvrir le dossier de la voix', enabled: fs.existsSync(dir()), click: () => shell.openPath(dir()) },
        {
          label: 'Supprimer la voix et la reconnaissance vocale...',
          enabled: fs.existsSync(dir()),
          click: async () => {
            const win = BrowserWindow.getAllWindows()[0];
            const { response } = await dialog.showMessageBox(win, {
              type: 'question', title: 'Claude Pet demande ton accord', message: 'Je supprime ma voix et la reconnaissance vocale ?',
              detail: dir(), buttons: ['Supprimer', 'Annuler'], defaultId: 1, cancelId: 1, noLink: true,
            });
            if (response !== 0) return;
            pet.settings.set('wakeWord', false);
            sendWake();
            fs.rmSync(dir(), { recursive: true, force: true });
          },
        },
      ],
    }]);
  },
  matchWake,
};
