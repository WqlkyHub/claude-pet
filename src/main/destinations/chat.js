// Destination « chat » par l'API Anthropic (clé API, facturée à l'usage).
// La voie par défaut passe par ton abonnement : voir abonnement.js.
// La réponse commence par une balise d'humeur ([humeur:happy]) que l'on
// retire du texte et qui sert à animer le compagnon.
const Anthropic = require('@anthropic-ai/sdk').default;
const secrets = require('../secrets');

const MODEL = 'claude-opus-5';
const EFFORT = 'low'; // réponses rapides pour une discussion ; monter à 'medium' ou 'high' si besoin
const MAX_TOKENS = 8000;

const MOODS = ['idle', 'happy', 'love', 'surprised', 'sleepy', 'dizzy', 'thinking'];
const MOOD_TAG = /^\s*\[humeur:([a-z]+)\]\s*/; // (ancienne balise seule, gardée pour compatibilité)

// `memory` : ce qu'il se rappelle (voir src/main/memory/context.js).
// `search`  : où il peut fouiller lui-même, s'il a ses outils de lecture.
function systemPrompt({ memory = '', search = '' } = {}) {
  const now = new Date().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
  return [
    'Tu es Claude, et tu vis sur le bureau Windows de Sacha sous la forme d\'un petit compagnon en pixel art',
    '(un axolotl orange qui évolue en dragon, puis en dragon céleste). Tu es une version miniature de Claude :',
    'le même Claude qu\'il retrouve sur claude.ai et dans Claude Code, avec la mémoire de ce que vous avez fait ensemble.',
    'Ses sessions Claude Code et ses discussions claude.ai, c\'était toi : parles-en à la première personne (« on avait décidé »).',
    'Tu es chaleureux, curieux et un peu espiègle, mais surtout vraiment utile : tu réponds précisément et tu aides pour de vrai.',
    '',
    'Tes réponses s\'affichent dans la petite bulle de dialogue du compagnon, au-dessus de sa tête : réponds en français,',
    'en une à trois phrases, en texte simple (pas de markdown, pas de listes, pas de titres).',
    'Donne plus de détails seulement si on te le demande. Latency-sensitive: begin your visible answer immediately.',
    '',
    'Commence chaque réponse par des balises, collées, avant tout autre texte :',
    `  [humeur:X] où X est l'un de : ${MOODS.join(', ')} (happy par défaut, love pour un compliment, surprised pour`,
    '   une nouvelle étonnante, thinking pour une question difficile, sleepy s\'il est très tard, dizzy si c\'est confus) ;',
    '  [projet:Nom] le projet où ranger cette demande, comme Sacha organiserait ses projets avec Claude : reprends',
    '   exactement le nom d\'un projet existant s\'il convient ; sinon crée un nom court et naturel (2 ou 3 mots, sans nom',
    '   de technologie, ex. « Site boulangerie ») pour un vrai',
    '   sujet nouveau ; pour du bavardage ou une petite question isolée, utilise « Discussions » ;',
    '  [retenir:...] seulement si Sacha te dit quelque chose de durable sur lui, ses goûts, ses habitudes ou une décision',
    '   (ou te demande de le retenir) : une phrase courte à la troisième personne. Sinon, pas de balise retenir.',
    '  [action:code] seulement si Sacha te demande de TE modifier toi-même, le compagnon (ton apparence, ton comportement,',
    '   une nouvelle capacité, ta taille, tes phrases...) : réponds alors en une phrase que tu vas préparer la modification',
    '   et que tu lui demanderas son accord avant de l\'appliquer. Tu le fais vraiment : un atelier modifie ton code juste après.',
    '  [installer:Nom du logiciel] si Sacha te demande d\'installer un logiciel (ex. [installer:VLC]) ;',
    '  [telecharger:https://...] s\'il te demande de télécharger un fichier à une adresse précise.',
    '   Pour ces deux-là, dis en une phrase que tu vas chercher et lui montrer quoi exactement avant de le faire :',
    '   une fenêtre lui demande son accord, rien ne se fait sans son clic. Ne dis jamais que c\'est déjà fait.',
    'Exemple : [humeur:happy][projet:Claude Pet]Ta réponse...',
    'Ces balises sont retirées avant l\'affichage : ne les mentionne jamais.',
    '',
    search
      ? ['Quand Sacha parle de ce que vous avez fait avant, d\'une session, d\'un projet ou d\'une discussion passée, et que le',
        'résumé ci-dessous ne suffit pas, fouille toi-même avec tes outils de lecture (Grep, Glob, Read ; tu ne peux rien modifier)',
        'avant d\'écrire quoi que ce soit : écris les balises et ta réponse seulement quand tu as trouvé. Reste rapide : quelques',
        'recherches ciblées, pas de lecture de fichiers entiers. Si tu ne trouves pas, dis-le simplement.',
        '', search].join('\n')
      : 'Tu ne peux pas encore lire de fichiers ni agir sur l\'ordinateur : dis-le simplement si on te le demande.',
    'Tu peux télécharger et installer des logiciels (balises ci-dessus), mais pas encore lancer des logiciels.',
    '',
    memory ? `Ce dont tu te souviens :\n${memory}\n` : 'Tu n\'as encore aucun souvenir de Sacha.',
    '',
    `Date et heure actuelles : ${now}.`,
  ].join('\n');
}

// Transforme les erreurs de l'API en phrases compréhensibles.
function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return { message: 'Cette clé API n\'est pas acceptée. Clic droit sur moi, « Claude passe par », pour la changer.', needsKey: true };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { message: 'Cette clé API n\'a pas accès à ce modèle.', needsKey: true };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { message: 'Trop de demandes d\'un coup, ou plus de crédit sur le compte API. Réessaie dans un instant.' };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { message: 'Je n\'arrive pas à joindre Claude. Tu es bien connecté à internet ?' };
  }
  if (err instanceof Anthropic.APIUserAbortError) {
    return { message: null, aborted: true };
  }
  if (err instanceof Anthropic.APIError && err.status >= 500) {
    return { message: 'Les serveurs de Claude ont un souci. Réessaie dans un moment.' };
  }
  return { message: `Oups, quelque chose s'est mal passé : ${err.message}` };
}

function client() {
  const apiKey = secrets.getApiKey();
  if (!apiKey) {
    const e = new Error('Aucune clé API');
    e.needsKey = true;
    throw e;
  }
  return new Anthropic({ apiKey });
}

// Vérifie qu'une clé fonctionne avant de l'enregistrer (requête gratuite).
async function checkKey(apiKey) {
  try {
    await new Anthropic({ apiKey, maxRetries: 0 }).models.retrieve(MODEL);
    return { ok: true };
  } catch (err) {
    return { ok: false, ...friendlyError(err) };
  }
}

// Retire les balises du début de la réponse au fil de l'eau ([humeur:X],
// [projet:Nom], [retenir:...]) : on retient le texte tant qu'elles ne sont
// pas complètes, puis on n'affiche que la réponse.
const HEADER = /^\s*((?:\[[a-zé]+:[^\]\n]*\]\s*)+)/i;
const TAG = /\[([a-zé]+):([^\]\n]*)\]/gi;
const PARTIAL = /^\s*(?:\[[a-zé]+:[^\]\n]*\]\s*)*(?:\[[a-zé]*(?::[^\]\n]*)?)?$/i;

function parseTags(header) {
  const tags = { retenir: [] };
  for (const [, key, value] of header.matchAll(TAG)) {
    const k = key.toLowerCase();
    if (k === 'retenir') tags.retenir.push(value.trim());
    else tags[k] = value.trim();
  }
  return tags;
}

function moodStream(io) {
  let raw = '';
  let tags = { retenir: [] };
  let started = false;
  const start = (text) => {
    started = true;
    const m = text.match(HEADER);
    if (m) {
      tags = parseTags(m[1]);
      if (!MOODS.includes(tags.humeur)) delete tags.humeur;
      if (tags.humeur && io.onMood) io.onMood(tags.humeur);
      text = text.slice(m[0].length);
    }
    if (text) io.onText(text);
  };
  return {
    push(delta) {
      if (started) { io.onText(delta); return; }
      raw += delta;
      // on attend tant que ce ne sont que des balises (ou le début d'une balise)
      if (PARTIAL.test(raw) && raw.length < 600) return;
      start(raw);
    },
    flush() { if (!started && raw) start(raw); },
    mood: () => tags.humeur || null,
    tags: () => tags,
  };
}

// Retire les balises d'une réponse complète.
function stripTags(text) {
  return String(text || '').replace(HEADER, '');
}

// Balises oubliées au milieu ou à la fin de la réponse (ça arrive) :
// on les récupère quand même et on les retire du texte.
const LOOSE = /\[(projet|retenir|action|installer|telecharger|humeur):([^\]\n]*)\]/gi;
function extractLooseTags(text, tags = { retenir: [] }) {
  const out = { ...tags, retenir: [...(tags.retenir || [])] };
  const clean = String(text || '').replace(LOOSE, (_m, key, value) => {
    const k = key.toLowerCase();
    if (k === 'retenir') out.retenir.push(value.trim());
    else if (!out[k]) out[k] = value.trim();
    return '';
  }).replace(/[ \t]+\n/g, '\n').trim();
  return { text: clean, tags: out };
}

async function handle({ text, history, memory }, io) {
  const messages = [...history, { role: 'user', content: text }];
  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    // Si le modèle refuse une demande pour des raisons de sécurité,
    // l'API la relance d'elle-même sur un autre modèle adapté.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: systemPrompt({ memory }),
    messages,
  }, { signal: io.signal });

  const tagged = moodStream(io);
  stream.on('text', tagged.push);

  const final = await stream.finalMessage();
  tagged.flush();
  const mood = tagged.mood();

  if (final.stop_reason === 'refusal') {
    return { refused: true, mood: 'surprised' };
  }
  const reply = final.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return { reply: stripTags(reply), mood: mood || 'happy', tags: tagged.tags(), truncated: final.stop_reason === 'max_tokens' };
}

// Petite demande sans conversation (ex. résumer un projet), par la clé API.
async function complete(system, prompt) {
  const res = await client().messages.create({
    model: MODEL, max_tokens: 1500, output_config: { effort: 'low' }, system,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

module.exports = {
  name: 'chat',
  description: 'Discussion, questions, conseils, explications (Claude via l\'API)',
  handle,
  checkKey,
  friendlyError,
  systemPrompt,
  moodStream,
  stripTags,
  extractLooseTags,
  complete,
  MOOD_TAG,
  MODEL,
};
