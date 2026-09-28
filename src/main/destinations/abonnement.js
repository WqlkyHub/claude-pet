// Parler avec Claude en passant par ton abonnement (Pro ou Max), sans clé API.
//
// Le compagnon demande à Claude Code, installé et connecté à ton compte Claude
// sur ce PC, de répondre à sa place (`claude -p`). Ses seuls outils sont des
// outils de LECTURE (Read, Grep, Glob), limités à la mémoire du compagnon et à
// tes sessions Claude Code, pour retrouver ce que vous avez fait avant : il ne
// peut rien modifier, rien lancer, rien télécharger. Ça compte dans le quota de ton
// abonnement, comme une conversation sur claude.ai, et rien n'est facturé à
// l'usage. La variable ANTHROPIC_API_KEY est retirée pour que Claude Code
// n'utilise jamais une clé API par erreur.
//
// Au passage, Claude Code donne l'état de ton quota : on le recopie pour que
// le compagnon fatigue au bon moment (module quota).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { app } = require('electron');
const { systemPrompt, moodStream, stripTags } = require('./chat');

const USAGE_FILE = path.join(os.homedir(), '.claude', 'claude-pet-usage.json');
const EFFORT = 'low';
const TIMEOUT_MS = 180 * 1000;
const READ_TOOLS = 'Read,Grep,Glob'; // lecture seule

let cachedExe;

// Où est installé Claude Code ? (claude.exe avec l'installeur officiel, claude.cmd avec npm)
function findClaude() {
  if (cachedExe !== undefined) return cachedExe;
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(finder, ['claude'], { encoding: 'utf8', windowsHide: true });
  const found = (res.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const local = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
  if (!found.length && fs.existsSync(local)) found.push(local);
  // sous Windows, on préfère un .exe (lancé directement) à un .cmd
  cachedExe = found.find((f) => /\.exe$/i.test(f)) || found.find((f) => /\.(cmd|bat)$/i.test(f)) || found[0] || null;
  return cachedExe;
}

function cleanEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // jamais de facturation à l'usage par cette voie
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

function run(exe, args, opts = {}) {
  // Un .cmd ne se lance que par l'invite de commandes ; les arguments sont
  // des mots simples (le texte passe par l'entrée standard), on les met entre guillemets.
  const viaShell = /\.(cmd|bat)$/i.test(exe);
  return spawn(viaShell ? `"${exe}"` : exe, viaShell ? args.map((a) => `"${a}"`) : args, {
    windowsHide: true, shell: viaShell, env: cleanEnv(), ...opts,
  });
}

// Claude Code est-il installé, et connecté à un compte Claude ? (asynchrone, ~1 s)
function status() {
  const exe = findClaude();
  if (!exe) return Promise.resolve({ installed: false, loggedIn: false });
  return new Promise((resolve) => {
    let out = '';
    const child = run(exe, ['auth', 'status'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.on('error', () => { clearTimeout(timer); resolve({ installed: false, loggedIn: false }); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const info = JSON.parse(out.slice(out.indexOf('{')));
        resolve({ installed: true, loggedIn: Boolean(info.loggedIn), method: info.authMethod || '' });
      } catch {
        resolve({ installed: true, loggedIn: null }); // on ne sait pas : on essaiera
      }
    });
  });
}

function promptFile(options) {
  const file = path.join(app.getPath('userData'), 'claude-pet-prompt.txt');
  fs.writeFileSync(file, systemPrompt(options));
  return file;
}

// Claude Code ne garde pas la conversation d'un appel à l'autre ici :
// on lui redonne les derniers échanges dans le message.
function withHistory(text, history) {
  if (!history.length) return text;
  const lines = history.slice(-12).map((m) => `${m.role === 'user' ? 'Moi' : 'Toi'} : ${m.content}`);
  return `Notre conversation jusqu'ici :\n${lines.join('\n')}\n\nMon nouveau message : ${text}`;
}

function saveUsage(info) {
  const w = info && info.unifiedWindows;
  if (!w) return;
  const pick = (x) => (x && typeof x.utilization === 'number'
    ? { used_percentage: Math.round(x.utilization * 1000) / 10, resets_at: x.resetsAt || null } : null);
  const usage = { five_hour: pick(w.five_hour), seven_day: pick(w.seven_day) };
  if (!usage.five_hour && !usage.seven_day) return;
  try {
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify({ ...usage, updated_at: Math.floor(Date.now() / 1000) }, null, 2));
  } catch { /* pas grave */ }
}

// Erreur lisible, avec le type pour décider d'un éventuel passage par l'API.
function failure(kind, message) {
  const e = new Error(message);
  e.kind = kind; // 'missing' | 'login' | 'quota' | 'other'
  e.friendly = message;
  return e;
}

// `memory` : ce dont il se souvient ; `search` : { help, cwd, dirs } pour
// fouiller lui-même en lecture seule (absent = aucun outil).
function handle({ text, history, memory, search }, io) {
  const exe = findClaude();
  if (!exe) {
    return Promise.reject(failure('missing',
      'Pour passer par ton abonnement, il me faut Claude Code sur ce PC. Tout est expliqué dans le README.'));
  }
  const tools = search ? ['--tools', READ_TOOLS, '--allowedTools', READ_TOOLS,
    ...search.dirs.flatMap((d) => ['--add-dir', d])] : ['--tools', ''];
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    ...tools, '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
    '--effort', EFFORT, '--system-prompt-file', promptFile({ memory, search: search && search.help })];

  return new Promise((resolve, reject) => {
    const child = run(exe, args, { cwd: (search && search.cwd) || app.getPath('userData'), stdio: ['pipe', 'pipe', 'pipe'] });
    let tagged = moodStream(io);
    let searching = false;
    let buffer = '';
    let errText = '';
    let full = '';
    let result = null;
    let done = false;
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    const onAbort = () => child.kill();
    if (io.signal) io.signal.addEventListener('abort', onAbort);

    const finish = (fn) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (io.signal) io.signal.removeEventListener('abort', onAbort);
      fn();
    };

    const onLine = (line) => {
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'stream_event' && ev.event && ev.event.type === 'content_block_start'
        && ev.event.content_block && ev.event.content_block.type === 'tool_use') {
        // Il va fouiller : ce qu'il a écrit avant n'était qu'un « je regarde »,
        // on repart de zéro pour la vraie réponse.
        if (!searching && io.onStatus) io.onStatus('Je fouille dans nos souvenirs…');
        searching = true;
        if (full && io.onReset) io.onReset();
        full = '';
        tagged = moodStream(io);
      } else if (ev.type === 'stream_event' && ev.event && ev.event.type === 'content_block_delta'
        && ev.event.delta && ev.event.delta.type === 'text_delta') {
        full += ev.event.delta.text;
        tagged.push(ev.event.delta.text);
      } else if (ev.type === 'rate_limit_event') {
        saveUsage(ev.rate_limit_info);
      } else if (ev.type === 'result') {
        result = ev;
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        onLine(buffer.slice(0, nl).trim());
        buffer = buffer.slice(nl + 1);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { errText += c; });
    child.on('error', (err) => finish(() => reject(failure('missing', `Je n'arrive pas à lancer Claude Code : ${err.message}`))));
    child.on('close', () => finish(() => {
      if (buffer.trim()) onLine(buffer.trim());
      if (io.signal && io.signal.aborted) {
        const e = new Error('annulé');
        e.aborted = true;
        reject(e);
        return;
      }
      const message = `${result && result.result ? result.result : ''} ${errText}`;
      if (!result || result.is_error) {
        if (/log ?in|not logged|authenticat|credentials|oauth/i.test(message)) {
          reject(failure('login', 'Claude Code n\'est pas connecté à ton compte. Ouvre un terminal, tape « claude », puis /login.'));
        } else if (/usage limit|limit reached|rate limit|quota|out of (extra )?usage/i.test(message)) {
          reject(failure('quota', 'Ton abonnement Claude est à bout pour le moment. Il se recharge bientôt.'));
        } else {
          reject(failure('other', `Claude Code n'a pas pu répondre${message.trim() ? ` : ${message.trim().slice(0, 160)}` : '.'}`));
        }
        return;
      }
      if (!full && result.result) tagged.push(result.result);
      tagged.flush();
      const reply = stripTags(full || result.result || '').trim();
      resolve({ reply, mood: tagged.mood() || 'happy', tags: tagged.tags() });
    }));

    child.stdin.end(withHistory(text, history));
  });
}

// Petite demande sans conversation ni outil (ex. résumer un projet).
function complete(system, prompt) {
  const exe = findClaude();
  if (!exe) return Promise.reject(failure('missing', 'Claude Code introuvable'));
  const file = path.join(app.getPath('userData'), 'claude-pet-prompt-resume.txt');
  fs.writeFileSync(file, system);
  const args = ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--disable-slash-commands',
    '--no-session-persistence', '--effort', 'low', '--system-prompt-file', file];
  return new Promise((resolve, reject) => {
    let out = '';
    const child = run(exe, args, { cwd: app.getPath('userData'), stdio: ['pipe', 'pipe', 'ignore'] });
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const res = JSON.parse(out.slice(out.indexOf('{')));
        if (res.is_error) throw new Error(res.result || 'erreur');
        resolve(String(res.result || '').trim());
      } catch (err) { reject(err); }
    });
    child.stdin.end(prompt);
  });
}

module.exports = {
  name: 'abonnement',
  description: 'Discussion avec Claude par ton abonnement, via Claude Code',
  handle,
  status,
  findClaude,
  complete,
  run,
};
