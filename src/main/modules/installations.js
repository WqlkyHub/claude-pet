// Télécharger et installer des choses pour toi, quand tu le lui demandes
// (« installe VLC », « télécharge ce fichier : https://... »).
//
// Rien ne se passe sans ton clic : il te montre d'abord exactement quoi, d'où,
// et comment, puis attend ton accord.
//   - Logiciels : par winget, le gestionnaire officiel de Windows. Il cherche le
//     logiciel, te montre les résultats (nom, identifiant, version, source) et
//     tu choisis lequel installer. Windows peut aussi te demander son accord.
//   - Fichiers : téléchargés dans ton dossier Téléchargements ; si c'est un
//     installeur (.exe, .msi), il te demande encore avant de le lancer.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app, dialog, net, shell, BrowserWindow } = require('electron');

function run(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; if (onLine) onLine(c); });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
  });
}

// Lit le tableau de « winget search » quelle que soit la langue de Windows :
// les colonnes sont repérées sur la ligne de titres, juste au-dessus des tirets.
function parseTable(out) {
  const lines = out.split(/\r?\n|\r/); // winget réécrit sa ligne d'attente avec \r
  const sep = lines.findIndex((l) => /^-{10,}/.test(l.trim()));
  if (sep < 1) return [];
  const header = lines[sep - 1];
  const starts = [...header.matchAll(/\S+(?:\s\S+)*/g)].map((m) => m.index);
  if (starts.length < 3) return [];
  return lines.slice(sep + 1).filter((l) => l.trim()).map((l) => {
    const cols = starts.map((s, i) => l.slice(s, starts[i + 1]).trim());
    return { nom: cols[0], id: cols[1], version: cols[2], source: cols[cols.length - 1] };
  }).filter((r) => r.id && !/\s/.test(r.id));
}

module.exports = {
  name: 'installations',
  setup(pet) {
    const say = (t, d = 7000) => pet.say(t, { duration: d });
    const win = () => BrowserWindow.getAllWindows()[0];
    let busy = false;

    async function installSoftware(query) {
      if (process.platform !== 'win32') { say('Je ne sais installer des logiciels que sous Windows.'); return; }
      pet.setMood('thinking');
      say(`Je cherche « ${query} »…`, 20000);
      let found;
      try {
        const res = await run('winget', ['search', query, '--accept-source-agreements', '--disable-interactivity']);
        found = parseTable(res.out).slice(0, 3);
      } catch {
        pet.setMood('dizzy', 2000);
        say('winget n\'est pas disponible sur ce PC. Installe « App Installer » depuis le Microsoft Store, puis redemande-moi.', 9000);
        return;
      }
      if (!found.length) { pet.setMood('idle'); say(`Je n'ai rien trouvé pour « ${query} ».`); return; }
      const { response } = await dialog.showMessageBox(win(), {
        type: 'question',
        title: 'Claude Pet demande ton accord',
        message: found.length > 1 ? `Lequel j'installe pour « ${query} » ?` : `J'installe ${found[0].nom} ?`,
        detail: `${found.map((r) => `• ${r.nom}\n   identifiant ${r.id} · version ${r.version} · source ${r.source}`).join('\n')}\n\n`
          + 'Installation avec winget, le gestionnaire officiel de Windows '
          + '(winget install --id <identifiant> --exact). Windows peut aussi te demander son accord.',
        buttons: [...found.map((r) => `Installer ${r.nom}`.slice(0, 40)), 'Annuler'],
        defaultId: 0,
        cancelId: found.length,
        noLink: true,
      });
      if (response >= found.length) { pet.setMood('idle'); say('D\'accord, je n\'installe rien.', 3000); return; }
      const pick = found[response];
      say(`J'installe ${pick.nom}…`, 600000);
      const res = await run('winget', ['install', '--id', pick.id, '--exact', '--accept-package-agreements',
        '--accept-source-agreements', '--disable-interactivity'], (chunk) => {
        const m = chunk.match(/(\d{1,3}) ?%/);
        if (m) pet.send({ type: 'voice-status', status: `J'installe ${pick.nom}… ${m[1]} %` });
      });
      pet.send({ type: 'voice-status', status: '' });
      if (res.code === 0) {
        pet.setMood('happy', 4000);
        pet.play('hop');
        say(`${pick.nom} est installé !`);
      } else {
        pet.setMood('dizzy', 2500);
        const last = res.out.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';
        say(`L'installation de ${pick.nom} n'a pas marché${last ? ` : ${last.slice(0, 140)}` : '.'}`, 9000);
      }
    }

    async function downloadFile(url) {
      let u;
      try { u = new URL(url); } catch { say('Cette adresse ne ressemble pas à un lien de téléchargement.'); return; }
      if (!/^https?:$/.test(u.protocol)) { say('Je ne télécharge que des liens http ou https.'); return; }
      const name = decodeURIComponent(path.basename(u.pathname)) || 'telechargement';
      const dest = path.join(app.getPath('downloads'), name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'));
      const { response } = await dialog.showMessageBox(win(), {
        type: 'question',
        title: 'Claude Pet demande ton accord',
        message: `Je télécharge « ${name} » ?`,
        detail: `Depuis : ${u.href}\nVers : ${dest}`,
        buttons: ['Télécharger', 'Annuler'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) { say('D\'accord, je ne télécharge rien.', 3000); return; }
      pet.setMood('thinking');
      say(`Je télécharge ${name}…`, 600000);
      try {
        const res = await net.fetch(u.href);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      } catch (err) {
        pet.setMood('dizzy', 2500);
        say(`Le téléchargement a échoué : ${err.message}`, 8000);
        return;
      }
      pet.setMood('happy', 3000);
      if (/\.(exe|msi|msix|appx)$/i.test(dest)) {
        const again = await dialog.showMessageBox(win(), {
          type: 'question',
          title: 'Claude Pet demande ton accord',
          message: `« ${name} » est téléchargé. Je lance l'installation ?`,
          detail: `${dest}\n\nLance-le seulement si tu fais confiance à ce site (${u.hostname}).`,
          buttons: ['Lancer l\'installation', 'Juste l\'afficher', 'Rien'],
          defaultId: 1,
          cancelId: 2,
          noLink: true,
        });
        if (again.response === 0) shell.openPath(dest);
        else if (again.response === 1) shell.showItemInFolder(dest);
      } else {
        shell.showItemInFolder(dest);
      }
      say(`${name} est dans tes Téléchargements.`, 5000);
    }

    async function guarded(fn, arg) {
      if (busy) { say('Une chose à la fois, je suis déjà en train de m\'en occuper !'); return; }
      busy = true;
      try { await fn(arg); } catch (err) { say(`Oups : ${err.message}`, 7000); } finally { busy = false; }
    }

    pet.installer = {
      software: (q) => guarded(installSoftware, q),
      file: (url) => guarded(downloadFile, url),
    };
  },
  parseTable,
};
