// Lecture seule de tes sessions Claude Code sur ce PC.
//
// Claude Code garde chaque conversation dans ~/.claude/projects/<dossier>/<id>.jsonl
// (sous Windows : C:\Users\<toi>\.claude\projects\). On en tire un petit
// sommaire (titre, dossier de travail, date, première demande) pour que le
// compagnon sache ce que vous avez fait ; il peut ensuite relire une session
// en détail avec ses outils de lecture. Rien n'est jamais modifié là-bas.
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const MAX_SESSIONS = 300;
const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 64 * 1024;

let cache = new Map(); // fichier → { mtime, info }

function readPart(file, start, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const n = fs.readSync(fd, buf, 0, length, start);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function textOf(message) {
  if (!message) return '';
  const c = message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ');
  return '';
}

// Un vrai message de toi (pas un rappel système ni un résultat d'outil).
function isHumanText(t) {
  const s = t.trim();
  return s && !s.startsWith('<') && !s.startsWith('Caveat:') && !s.startsWith('[Request interrupted');
}

function parseSession(file, size) {
  const head = readPart(file, 0, Math.min(size, HEAD_BYTES));
  const tail = size > HEAD_BYTES ? readPart(file, Math.max(HEAD_BYTES, size - TAIL_BYTES), TAIL_BYTES) : '';
  const info = { id: path.basename(file, '.jsonl'), fichier: file, titre: '', dossier: '', debut: 0, fin: 0, premiereDemande: '', demandes: 0 };
  for (const chunk of [head, tail]) {
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('{')) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if ((ev.type === 'ai-title' && ev.aiTitle) || (ev.type === 'summary' && ev.summary)) info.titre = ev.aiTitle || ev.summary;
      if (ev.type === 'custom-title' && ev.customTitle) info.titre = ev.customTitle;
      if (ev.cwd && !info.dossier) info.dossier = ev.cwd;
      const t = ev.timestamp ? Date.parse(ev.timestamp) : 0;
      if (t) {
        if (!info.debut || t < info.debut) info.debut = t;
        if (t > info.fin) info.fin = t;
      }
      if (ev.type === 'user' && !ev.isMeta && !ev.isSidechain) {
        const txt = textOf(ev.message);
        if (isHumanText(txt)) {
          info.demandes += 1;
          if (!info.premiereDemande) info.premiereDemande = txt.replace(/\s+/g, ' ').trim().slice(0, 200);
        }
      }
    }
  }
  return info;
}

// Sommaire des sessions, les plus récentes d'abord.
function sessions() {
  let files = [];
  try {
    for (const d of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const sub = path.join(PROJECTS_DIR, d.name);
      for (const f of fs.readdirSync(sub)) {
        if (!f.endsWith('.jsonl')) continue;
        const file = path.join(sub, f);
        try {
          const st = fs.statSync(file);
          files.push({ file, mtime: st.mtimeMs, size: st.size });
        } catch { /* fichier disparu */ }
      }
    }
  } catch {
    return []; // pas de Claude Code, ou jamais utilisé
  }
  files = files.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_SESSIONS);
  const next = new Map();
  const out = [];
  for (const { file, mtime, size } of files) {
    let hit = cache.get(file);
    if (!hit || hit.mtime !== mtime) {
      try { hit = { mtime, info: parseSession(file, size) }; } catch { continue; }
    }
    next.set(file, hit);
    if (hit.info.demandes > 0) out.push(hit.info);
  }
  cache = next;
  return out;
}

module.exports = { PROJECTS_DIR, sessions };
