// Mises à jour de Claude Pet depuis son dépôt GitHub (public).
//
// Le dépôt contient le code du compagnon, avec dans package.json son numéro
// de version et dans nouveautes.json ce qui a changé. On lit le package.json
// en ligne ; s'il annonce une version plus récente, on télécharge le code
// (archive .zip de GitHub), on garde une copie de la version actuelle, on
// remplace les fichiers du compagnon (jamais tes réglages ni sa mémoire, qui
// sont dans %APPDATA%), on réinstalle les dépendances si elles ont changé, et
// il redémarre.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { app, net } = require('electron');

const ROOT = path.resolve(app.getAppPath());
const SKIP = new Set(['node_modules', '.git', 'dist']);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function current() {
  return readJson(path.join(ROOT, 'package.json'), {});
}

function source() {
  const u = current().updates || {};
  if (process.env.CLAUDE_PET_UPDATE_URL) { // pour les tests : un serveur local
    const base = process.env.CLAUDE_PET_UPDATE_URL;
    return { raw: base, zip: `${base}/archive.zip` };
  }
  if (!u.github) return null;
  const branch = u.branch || 'main';
  return {
    raw: `https://raw.githubusercontent.com/${u.github}/${branch}`,
    zip: `https://codeload.github.com/${u.github}/zip/refs/heads/${branch}`,
  };
}

// « 0.10.0 » > « 0.9.2 »
function newer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function getJson(url) {
  const res = await net.fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Renvoie null si tout est à jour, sinon { version, nouveautes: [texte...] }.
async function check() {
  const src = source();
  if (!src) return null;
  const { raw } = src;
  const remote = await getJson(`${raw}/package.json?t=${Date.now()}`);
  const here = current().version || '0.0.0';
  if (!remote.version || !newer(remote.version, here)) return null;
  let notes = [];
  try {
    const all = await getJson(`${raw}/nouveautes.json?t=${Date.now()}`);
    notes = (Array.isArray(all) ? all : []).filter((n) => n && newer(n.version, here))
      .sort((a, b) => (newer(a.version, b.version) ? -1 : 1)).map((n) => n.texte);
  } catch { /* pas de liste de nouveautés : pas grave */ }
  return { version: remote.version, nouveautes: notes };
}

function exec(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: 'ignore', ...opts });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} a échoué (${code})`))));
  });
}

async function unzip(zip, dest) {
  if (process.platform === 'win32') {
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    try {
      await exec(tar, ['-xf', zip, '-C', dest]); // Windows 10 et 11
      return;
    } catch {
      await exec('powershell.exe', ['-NoProfile', '-Command',
        `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`]);
      return;
    }
  }
  await exec('unzip', ['-q', '-o', zip, '-d', dest]);
}

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(b, { recursive: true });
      copyTree(a, b);
    } else if (entry.isFile()) {
      fs.copyFileSync(a, b);
    }
  }
}

const depsOf = (pkg) => JSON.stringify([pkg.dependencies || {}, pkg.devDependencies || {}]);

// Installe la nouvelle version. `onStep(texte)` raconte où on en est.
async function install(onStep = () => {}) {
  const src = source();
  if (!src) throw new Error('Pas de source de mise à jour');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-pet-maj-'));
  try {
    onStep('Je télécharge les nouveautés…');
    const res = await net.fetch(src.zip, { cache: 'no-store' });
    if (!res.ok) throw new Error(`téléchargement impossible (HTTP ${res.status})`);
    const zip = path.join(work, 'maj.zip');
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));

    const out = path.join(work, 'x');
    fs.mkdirSync(out);
    await unzip(zip, out);
    const top = fs.readdirSync(out).map((d) => path.join(out, d)).find((d) => fs.existsSync(path.join(d, 'package.json')));
    if (!top) throw new Error('archive inattendue');
    const next = readJson(path.join(top, 'package.json'), {});
    if (next.name !== 'claude-pet') throw new Error('ce n\'est pas Claude Pet');

    onStep('Je m\'installe…');
    // Copie de secours de la version actuelle (sans node_modules).
    const backup = path.join(app.getPath('userData'), 'version-precedente');
    fs.rmSync(backup, { recursive: true, force: true });
    fs.mkdirSync(backup, { recursive: true });
    copyTree(ROOT, backup);
    const depsChanged = depsOf(current()) !== depsOf(next);
    try {
      copyTree(top, ROOT);
    } catch (err) {
      copyTree(backup, ROOT); // on remet tout comme avant
      throw err;
    }

    if (depsChanged) {
      onStep('J\'installe ce qui me manque…');
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      try {
        await exec(npm, ['install', '--no-audit', '--no-fund'], { cwd: ROOT, shell: process.platform === 'win32' });
      } catch (err) {
        copyTree(backup, ROOT); // sans ses dépendances, la nouvelle version ne marcherait pas
        throw new Error(`installation des dépendances impossible (${err.message}) ; relance Installer.cmd`);
      }
    }
    return next.version;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Nouvelles de Claude : historique.json, tenu à jour par Claude dans l'app
// (ce que vous avez fait ensemble dans tes projets), lu sans rien installer.
// Renvoie le contenu s'il a changé depuis `known` (date « maj »), sinon null.
async function fetchHistory(known) {
  const src = source();
  if (!src) return null;
  const h = await getJson(`${src.raw}/historique.json?t=${Date.now()}`);
  if (!h || !Array.isArray(h.projets) || h.maj === known) return null;
  return h;
}

module.exports = { check, install, newer, source, fetchHistory, copyTree, unzip, ROOT };
