// Ouvrir un logiciel ou un site quand tu le lui demandes (« ouvre Spotify »,
// « lance Netflix »). Ouvrir ne modifie rien sur ton PC : il le fait donc
// directement, sans fenêtre d'accord (tu peux l'exiger dans le menu).
//   - Logiciels : il cherche dans la liste des applications du menu Démarrer
//     (Get-StartApps : logiciels classiques et applis du Microsoft Store) et
//     lance celle qui correspond le mieux au nom.
//   - Sites : il les ouvre dans ton navigateur par défaut (http et https seulement).
const { spawn } = require('child_process');
const { dialog, shell, BrowserWindow } = require('electron');

const CACHE_MS = 10 * 60 * 1000;
let cache = { t: 0, apps: [] };

// La liste des applications du menu Démarrer : [{ Name, AppID }].
function startApps() {
  if (Date.now() - cache.t < CACHE_MS && cache.apps.length) return Promise.resolve(cache.apps);
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (c) => { out += c; });
    ps.on('error', () => resolve([]));
    ps.on('close', () => {
      try {
        const list = JSON.parse(out.trim() || '[]');
        cache = { t: Date.now(), apps: Array.isArray(list) ? list : [list] };
      } catch { cache = { t: 0, apps: [] }; }
      resolve(cache.apps);
    });
  });
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Le meilleur nom pour la demande ; évite les désinstalleurs et l'aide.
function bestMatch(apps, wanted) {
  const w = norm(wanted);
  if (!w) return null;
  let best = null;
  let bestScore = 0;
  for (const a of apps) {
    const n = norm(a.Name);
    if (!n || /desinstall|uninstall|readme|aide|help|documentation/.test(n)) continue;
    let score = 0;
    if (n === w) score = 100;
    else if (n.startsWith(`${w} `) || n.endsWith(` ${w}`)) score = 80 - n.length / 10;
    else if (` ${n} `.includes(` ${w} `)) score = 60 - n.length / 10;
    else if (n.includes(w)) score = 40 - n.length / 10;
    else {
      const words = w.split(' ');
      const hits = words.filter((x) => x.length > 2 && n.includes(x)).length;
      if (hits && hits === words.filter((x) => x.length > 2).length) score = 30 - n.length / 10;
    }
    if (score > bestScore) { best = a; bestScore = score; }
  }
  return best;
}

module.exports = {
  name: 'ouvrir',
  setup(pet) {
    const say = (t, d = 5000) => pet.say(t, { duration: d });
    const askFirst = () => pet.settings.get('openConfirm', false);

    async function confirm(message, detail) {
      if (!askFirst()) return true;
      const { response } = await dialog.showMessageBox(BrowserWindow.getAllWindows()[0], {
        type: 'question', title: 'Claude Pet demande ton accord', message, detail,
        buttons: ['Ouvrir', 'Annuler'], defaultId: 0, cancelId: 1, noLink: true,
      });
      return response === 0;
    }

    async function openApp(name) {
      if (process.platform !== 'win32') { say('Je ne sais ouvrir des logiciels que sous Windows.'); return; }
      const app = bestMatch(await startApps(), name);
      if (!app) { say(`Je ne trouve pas « ${name} » dans tes logiciels.`, 6000); return; }
      if (!(await confirm(`J'ouvre ${app.Name} ?`, app.AppID))) return;
      spawn('explorer.exe', [`shell:AppsFolder\\${app.AppID}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      pet.play('hop');
    }

    async function openSite(url) {
      let u;
      try { u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); } catch { say('Je ne comprends pas cette adresse.'); return; }
      if (!/^https?:$/.test(u.protocol)) { say('Je n\'ouvre que des sites en http ou https.'); return; }
      if (!(await confirm(`J'ouvre ${u.hostname} dans ton navigateur ?`, u.href))) return;
      await shell.openExternal(u.href);
      pet.play('hop');
    }

    pet.tools.register('ouvrir-logiciel', {
      description: 'Ouvre un logiciel installé', modifies: false,
      run: ({ nom }) => openApp(nom),
    });
    pet.tools.register('ouvrir-site', {
      description: 'Ouvre un site dans le navigateur par défaut', modifies: false,
      run: ({ url }) => openSite(url),
    });
    pet.opener = {
      app: (n) => openApp(n).catch((err) => say(`Je n'ai pas réussi à l'ouvrir : ${err.message}`)),
      site: (u) => openSite(u).catch((err) => say(`Je n'ai pas réussi à l'ouvrir : ${err.message}`)),
    };

    pet.addMenuItems(() => [{
      label: 'Me demander avant d\'ouvrir un logiciel ou un site', type: 'checkbox', checked: askFirst(),
      click: (item) => pet.settings.set('openConfirm', item.checked),
    }]);
  },
  bestMatch,
};
