// Mémoire durable du compagnon : ce que tu lui demandes, rangé par projet,
// comme tu le ferais avec Claude. Tout reste sur ton PC, dans son dossier de
// données (sous Windows : %APPDATA%\claude-pet\memoire\).
//
//   memoire/
//     projets.json            la liste des projets et leur résumé
//     souvenirs.json          ce qu'il doit retenir de toi (« retiens que... »)
//     echanges/<projet>.jsonl chaque demande et sa réponse, une par ligne
//     Projets/<Nom>.md        le même journal, lisible par toi
//
// Claude (via Claude Code) peut relire ces fichiers lui-même quand tu parles
// de ce que vous avez fait avant : voir destinations/abonnement.js.
const fs = require('fs');
const path = require('path');

let root = null;
let projects = null; // [{ id, nom, resume, cree, maj, echanges, depuisResume }]
let facts = null; // [{ t, texte, projet }]

const MAX_FACTS = 200;

function init(dir) {
  root = dir;
  fs.mkdirSync(path.join(root, 'echanges'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Projets'), { recursive: true });
  projects = readJson('projets.json', []);
  facts = readJson('souvenirs.json', []);
}

function dir() { return root; }

function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); } catch { return fallback; }
}

function writeJson(name, value) {
  const file = path.join(root, name);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

// « Claude Pet » → « claude-pet »
function slug(nom) {
  return String(nom).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'divers';
}

function safeFileName(nom) {
  return String(nom).replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Divers';
}

function listProjects() {
  return [...projects].sort((a, b) => (b.maj || 0) - (a.maj || 0));
}

function findProject(nom) {
  if (!nom) return null;
  const id = slug(nom);
  return projects.find((p) => p.id === id) || null;
}

function ensureProject(nom, resume = '') {
  const clean = String(nom).replace(/\s+/g, ' ').trim().slice(0, 60);
  let p = findProject(clean);
  if (!p) {
    p = { id: slug(clean), nom: clean, resume, cree: Date.now(), maj: Date.now(), echanges: 0, depuisResume: 0 };
    projects.push(p);
    writeJson('projets.json', projects);
    fs.writeFileSync(path.join(root, 'Projets', `${safeFileName(clean)}.md`),
      `# ${clean}\n\n${resume ? `${resume}\n\n` : ''}## Demandes\n\n`);
  }
  return p;
}

function setSummary(id, resume) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  p.resume = resume;
  p.depuisResume = 0;
  writeJson('projets.json', projects);
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

// Enregistre un échange dans son projet. Renvoie le projet.
function record({ projet, moi, toi, via }) {
  const p = ensureProject(projet || 'Discussions');
  const t = Date.now();
  const line = { t, moi, toi, ...(via ? { via } : {}) };
  fs.appendFileSync(path.join(root, 'echanges', `${p.id}.jsonl`), `${JSON.stringify(line)}\n`);
  const when = new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  fs.appendFileSync(path.join(root, 'Projets', `${safeFileName(p.nom)}.md`),
    `- **${when}** : ${oneLine(moi)}\n  > ${oneLine(toi)}\n`);
  p.maj = t;
  p.echanges = (p.echanges || 0) + 1;
  p.depuisResume = (p.depuisResume || 0) + 1;
  writeJson('projets.json', projects);
  return p;
}

function readExchanges(id) {
  try {
    return fs.readFileSync(path.join(root, 'echanges', `${id}.jsonl`), 'utf8')
      .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// Tous les échanges, du plus ancien au plus récent, avec leur projet.
function allExchanges() {
  const all = [];
  for (const p of projects) {
    for (const e of readExchanges(p.id)) all.push({ ...e, projet: p.nom });
  }
  return all.sort((a, b) => a.t - b.t);
}

function remember(texte, projet) {
  const clean = oneLine(texte).slice(0, 300);
  if (!clean) return;
  if (facts.some((f) => f.texte.toLowerCase() === clean.toLowerCase())) return;
  facts.push({ t: Date.now(), texte: clean, ...(projet ? { projet } : {}) });
  if (facts.length > MAX_FACTS) facts = facts.slice(-MAX_FACTS);
  writeJson('souvenirs.json', facts);
}

function listFacts() { return [...facts]; }

// Historique envoyé par Claude depuis l'app (voir update.fetchHistory).
function saveHistory(h) {
  writeJson('de-claude.json', h);
}

function readHistory() {
  return readJson('de-claude.json', null);
}

function forgetAll() {
  fs.rmSync(root, { recursive: true, force: true });
  init(root);
}

module.exports = {
  init, dir, slug, listProjects, findProject, ensureProject, setSummary,
  record, readExchanges, allExchanges, remember, listFacts, forgetAll, saveHistory, readHistory,
};
