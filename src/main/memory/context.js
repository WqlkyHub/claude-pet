// Prépare ce que le compagnon « se rappelle » avant de répondre : tes
// souvenirs, tes projets, les derniers échanges, et ce qui, dans tout ce que
// vous avez fait (avec lui, dans Claude Code, sur claude.ai), ressemble à ta
// demande. Recherche simple par mots, en local.
const path = require('path');
const store = require('./store');
const claudeCode = require('./claude-code');
const claudeAi = require('./claude-ai');

const STOP = new Set(('avec dans pour mais sans sous comme quoi quel quelle quels quelles cette ceci cela '
  + 'est sont était fait faire faut peux peut veux veut vais etait avais avait avons avez ont '
  + 'tout tous toute toutes plus moins très bien alors donc aussi encore déjà jamais toujours '
  + 'quand comment pourquoi combien leur leurs notre nos votre vos mon mes ton tes son ses '
  + 'what with that this from have your about would could should there their').split(' '));

function words(text) {
  return [...new Set(String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
}

function score(haystack, keys) {
  if (!keys.length) return 0;
  const h = String(haystack).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let s = 0;
  for (const k of keys) if (h.includes(k)) s += 1;
  return s;
}

const day = (t) => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '?');
const when = (t) => new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const cut = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n)}…` : x; };

// `sinceReset` : on ne reprend pas les échanges d'avant « Nouvelle conversation ».
function recentHistory({ max = 12, sinceReset = 0, withinMs = 12 * 3600 * 1000 } = {}) {
  const from = Math.max(sinceReset, Date.now() - withinMs);
  return store.allExchanges().filter((e) => e.t > from).slice(-max);
}

function build(text, { useClaudeCode = true, pinned = null } = {}) {
  const keys = words(text);
  const parts = [];

  const facts = store.listFacts();
  if (facts.length) {
    parts.push('Ce que tu as retenu de Sacha :', ...facts.slice(-40).map((f) => `- ${f.texte}`), '');
  }

  const projects = store.listProjects();
  if (projects.length) {
    parts.push('Projets de Sacha (où tu ranges ses demandes), du plus récent au plus ancien :');
    for (const p of projects.slice(0, 25)) {
      parts.push(`- ${p.nom} (${p.echanges || 0} demandes, dernière le ${day(p.maj)})${p.resume ? ` : ${cut(p.resume, 400)}` : ''}`);
    }
    parts.push('');
  }
  // Ce que Claude, dans l'app, t'a transmis de vos projets.
  const fromClaude = store.readHistory();
  if (fromClaude && Array.isArray(fromClaude.projets) && fromClaude.projets.length) {
    parts.push(`Ce que vous avez fait ensemble dans l'app Claude (transmis le ${day(Date.parse(fromClaude.maj))}, c'était toi aussi) :`);
    for (const p of fromClaude.projets.slice(0, 15)) {
      parts.push(`- ${p.nom}${p.resume ? ` : ${cut(p.resume, 500)}` : ''}`);
      const events = (p.evenements || []).slice(-6);
      for (const e of events) parts.push(`    · ${e.date || ''} ${cut(e.texte, 200)}`);
    }
    for (const f of (fromClaude.souvenirs || []).slice(0, 20)) parts.push(`- (à savoir) ${cut(f, 200)}`);
    parts.push('');
  }
  if (pinned) parts.push(`Sacha a choisi de tout ranger dans le projet « ${pinned} » pour l'instant.`, '');

  // Échanges anciens qui ressemblent à la demande (hors conversation en cours).
  const recent = new Set(recentHistory().map((e) => e.t));
  const past = store.allExchanges().filter((e) => !recent.has(e.t))
    .map((e) => ({ e, s: score(`${e.moi} ${e.toi} ${e.projet}`, keys) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.e.t - a.e.t).slice(0, 6);
  if (past.length) {
    parts.push('Échanges passés avec Sacha qui semblent liés à sa demande :');
    for (const { e } of past) parts.push(`- [${when(e.t)}, ${e.projet}] Sacha : ${cut(e.moi, 200)} / Toi : ${cut(e.toi, 250)}`);
    parts.push('');
  }

  if (useClaudeCode) {
    const sessions = claudeCode.sessions();
    if (sessions.length) {
      const matching = sessions.map((s) => ({ s, sc: score(`${s.titre} ${s.premiereDemande} ${s.dossier}`, keys) }))
        .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 6).map((x) => x.s);
      const shown = [...new Set([...matching, ...sessions.slice(0, 8)])];
      parts.push(`Sessions Claude Code de Sacha sur ce PC (${sessions.length} au total, les liées à sa demande puis les plus récentes) :`);
      for (const s of shown) {
        parts.push(`- ${day(s.fin)} · ${s.titre || cut(s.premiereDemande, 80)} · dossier ${s.dossier || '?'} · `
          + `${s.demandes} demandes · début : « ${cut(s.premiereDemande, 140)} » · fichier ${s.fichier}`);
      }
      parts.push('');
    }
  }

  const ai = claudeAi.readIndex(store.dir());
  if (ai && ai.discussions.length) {
    const matching = ai.discussions.map((d) => ({ d, sc: score(`${d.titre} ${d.premiereDemande}`, keys) }))
      .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 6).map((x) => x.d);
    const shown = [...new Set([...matching, ...ai.discussions.slice(0, 5)])];
    parts.push(`Discussions claude.ai de Sacha (export importé le ${day(ai.importe)}, ${ai.discussions.length} au total) :`);
    for (const d of shown) parts.push(`- ${d.maj} · ${d.titre} · « ${cut(d.premiereDemande, 120)} » · fichier ${d.fichier}`);
    if (ai.projets.length) parts.push(`Projets claude.ai : ${ai.projets.map((p) => p.nom).join(', ')}`);
    parts.push('');
  }

  return parts.join('\n').trim();
}

// Où fouiller en détail (pour les outils de lecture de Claude Code).
function searchHelp({ useClaudeCode = true } = {}) {
  const dir = store.dir();
  const lines = [
    `Ta mémoire est dans ${dir} (ton dossier de travail) :`,
    `- ${path.join('echanges', '<projet>.jsonl')} : toutes les demandes de Sacha et tes réponses, une par ligne {t, moi, toi} ;`,
    `- ${path.join('Projets', '<Nom>.md')} : le même journal, par projet ; projets.json et souvenirs.json ;`,
    '- de-claude.json : l\'historique complet de vos projets dans l\'app Claude, transmis par Claude ;',
  ];
  if (claudeAi.readIndex(dir)) lines.push(`- ${path.join('claude-ai', 'discussions')} : ses discussions claude.ai, une par fichier .md ;`);
  if (useClaudeCode) {
    lines.push(`- ${claudeCode.PROJECTS_DIR} : ses sessions Claude Code (un dossier par dossier de travail, une session par fichier .jsonl,`
      + ' messages en JSON : cherche d\'abord avec Grep, puis lis seulement les passages utiles) et leurs notes de mémoire (dossiers memory/).');
  }
  return lines.join('\n');
}

module.exports = { build, searchHelp, recentHistory, words };
