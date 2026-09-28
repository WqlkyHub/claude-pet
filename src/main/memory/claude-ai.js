// Import de ton historique claude.ai (lecture seule).
//
// claude.ai n'offre aucun moyen pour une application de lire tes discussions.
// La seule voie officielle : Paramètres → Confidentialité → « Exporter les
// données ». Tu reçois un e-mail avec un fichier .zip ; une fois dézippé, il
// contient conversations.json (et projects.json). Le compagnon le lit, et range
// une copie de chaque discussion dans sa mémoire (memoire/claude-ai/) pour
// pouvoir la retrouver ensuite. Ton fichier d'origine n'est pas modifié.
const fs = require('fs');
const path = require('path');

function textOf(msg) {
  if (typeof msg.text === 'string' && msg.text.trim()) return msg.text;
  if (Array.isArray(msg.content)) {
    return msg.content.filter((b) => b && b.type === 'text' && b.text).map((b) => b.text).join('\n');
  }
  return '';
}

function safeName(s) {
  return String(s || 'sans titre').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'sans titre';
}

// `file` : conversations.json, ou le dossier qui le contient.
function importExport(file, memoryDir) {
  let dir = file;
  if (fs.statSync(file).isFile()) dir = path.dirname(file);
  const convFile = fs.statSync(file).isFile() ? file : path.join(dir, 'conversations.json');
  const conversations = JSON.parse(fs.readFileSync(convFile, 'utf8'));
  if (!Array.isArray(conversations)) throw new Error('Ce fichier ne ressemble pas à un export claude.ai.');

  let projects = [];
  try { projects = JSON.parse(fs.readFileSync(path.join(dir, 'projects.json'), 'utf8')); } catch { /* optionnel */ }

  const out = path.join(memoryDir, 'claude-ai');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'discussions'), { recursive: true });

  const index = [];
  for (const c of conversations) {
    const msgs = (c.chat_messages || []).map((m) => ({ qui: m.sender === 'human' ? 'Moi' : 'Claude', texte: textOf(m) }))
      .filter((m) => m.texte.trim());
    if (!msgs.length) continue;
    const date = (c.created_at || '').slice(0, 10);
    const name = `${date} ${safeName(c.name)} ${String(c.uuid || '').slice(0, 8)}`.trim();
    const md = [`# ${c.name || 'Sans titre'}`, '', `Discussion claude.ai du ${date}`, '',
      ...msgs.map((m) => `**${m.qui}** : ${m.texte}\n`)].join('\n');
    fs.writeFileSync(path.join(out, 'discussions', `${name}.md`), md);
    index.push({
      titre: c.name || 'Sans titre',
      date,
      maj: (c.updated_at || c.created_at || '').slice(0, 10),
      messages: msgs.length,
      premiereDemande: (msgs.find((m) => m.qui === 'Moi') || msgs[0]).texte.replace(/\s+/g, ' ').slice(0, 200),
      fichier: `claude-ai/discussions/${name}.md`,
    });
  }
  index.sort((a, b) => (b.maj > a.maj ? 1 : -1));

  const projets = (Array.isArray(projects) ? projects : []).map((p) => ({
    nom: p.name, description: (p.description || '').slice(0, 300), cree: (p.created_at || '').slice(0, 10),
  }));
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ importe: Date.now(), discussions: index, projets }, null, 2));
  return { discussions: index.length, projets: projets.length };
}

function readIndex(memoryDir) {
  try { return JSON.parse(fs.readFileSync(path.join(memoryDir, 'claude-ai', 'index.json'), 'utf8')); } catch { return null; }
}

module.exports = { importExport, readIndex };
