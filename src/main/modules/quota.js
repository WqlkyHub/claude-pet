// Énergie : le compagnon fatigue quand ton quota Claude (abonnement Pro ou Max)
// baisse, et retrouve la forme quand il se recharge. Chaque bout de quota que
// tu utilises le fait aussi évoluer.
//
// D'où viennent les chiffres : Claude Code donne l'utilisation de ton
// abonnement (sur 5 heures et sur 7 jours) au script de sa barre d'état. Le
// petit script tools/claude-pet-statusline.js les recopie dans
// ~/.claude/claude-pet-usage.json, que ce module surveille. Pour brancher ce
// script, le menu modifie ~/.claude/settings.json, toujours après ton accord.
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const USAGE_FILE = path.join(CLAUDE_DIR, 'claude-pet-usage.json');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const SCRIPT = path.resolve(__dirname, '..', '..', '..', 'tools', 'claude-pet-statusline.js');
// Barres obliques : Claude Code lance la commande via Git Bash ou PowerShell sous Windows.
const COMMAND = `node "${SCRIPT.replace(/\\/g, '/')}"`;

// Niveaux de fatigue selon le pourcentage du quota déjà utilisé.
const LEVELS = [
  { level: 0, from: 0 },
  { level: 1, from: 60 }, // respire plus lentement, baille parfois
  { level: 2, from: 80 }, // s'assoit, l'air fatigué
  { level: 3, from: 95 }, // KO : étalé par terre, yeux en croix
];
const POSES = ['', '', 'sit', 'ko'];
const XP_PER_PERCENT = 2; // évolution : 1 % de quota utilisé = 2 XP

const YAWNS = ['Aaaah... je fatigue un peu.', 'Petite baisse d\'énergie...', '*bâille*'];

function levelFor(used) {
  return [...LEVELS].reverse().find((l) => used >= l.from).level;
}

function hourText(epoch) {
  if (!epoch) return null;
  const d = new Date(epoch * 1000);
  const sameDay = d.toDateString() === new Date().toDateString();
  const h = `${d.getHours()} h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`;
  return sameDay ? `vers ${h}` : `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} vers ${h}`;
}

// Lit le fichier du relais ; ignore les fenêtres déjà remises à zéro.
function readUsage() {
  let data;
  try { data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); } catch { return null; }
  const now = Date.now() / 1000;
  const windows = ['five_hour', 'seven_day']
    .map((name) => ({ name, ...(data[name] || {}) }))
    .filter((w) => typeof w.used_percentage === 'number')
    .map((w) => (w.resets_at && w.resets_at <= now ? { ...w, used_percentage: 0 } : w));
  if (!windows.length) return null;
  const worst = windows.reduce((a, b) => (b.used_percentage > a.used_percentage ? b : a));
  return { worst, windows };
}

// --- Branchement dans Claude Code (fichier ~/.claude/settings.json) -------

function readClaudeSettings() {
  if (!fs.existsSync(CLAUDE_SETTINGS)) return {};
  return JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8')); // lève une erreur si illisible
}

function isConnected() {
  try {
    const sl = readClaudeSettings().statusLine;
    return Boolean(sl && typeof sl.command === 'string' && sl.command.includes('claude-pet-statusline.js'));
  } catch {
    return false;
  }
}

function connect() {
  const current = readClaudeSettings();
  if (current.statusLine && !isConnected()) {
    return { conflict: true };
  }
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  if (fs.existsSync(CLAUDE_SETTINGS)) {
    fs.copyFileSync(CLAUDE_SETTINGS, `${CLAUDE_SETTINGS}.claude-pet-sauvegarde`);
  }
  current.statusLine = { type: 'command', command: COMMAND };
  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(current, null, 2));
  return { ok: true };
}

function disconnect() {
  const current = readClaudeSettings();
  if (!isConnected()) return { ok: true };
  delete current.statusLine;
  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(current, null, 2));
  try { fs.unlinkSync(USAGE_FILE); } catch { /* déjà absent */ }
  return { ok: true };
}

module.exports = {
  name: 'quota',
  setup(pet) {
    const state = { level: 0, lastUsed: null, ...pet.settings.get('quota', {}) };
    let ready = false;

    pet.tools.register('brancher-quota-claude', {
      description: 'Suivre ton quota Claude',
      modifies: true,
      describe: () => [
        'Pour savoir quand tu utilises ton quota Claude, j\'ajoute une barre d\'état à Claude Code.',
        '',
        `Fichier modifié : ${CLAUDE_SETTINGS}`,
        'Ajout du réglage « statusLine », qui lance :',
        COMMAND,
        '',
        'Une copie de ton fichier actuel est gardée à côté (.claude-pet-sauvegarde).',
        'Le script ne fait que recopier tes pourcentages d\'utilisation dans claude-pet-usage.json.',
      ].join('\n'),
      run: connect,
    });

    pet.tools.register('debrancher-quota-claude', {
      description: 'Ne plus suivre ton quota Claude',
      modifies: true,
      describe: () => `Je retire la barre d'état de Claude Pet de ${CLAUDE_SETTINGS}.`,
      run: disconnect,
    });

    function apply(announce) {
      const usage = readUsage();
      if (!usage) return;
      const used = usage.worst.used_percentage;

      // Évolution : le quota consommé depuis la dernière lecture donne de l'expérience.
      const fiveHour = usage.windows.find((w) => w.name === 'five_hour');
      if (fiveHour) {
        if (state.lastUsed !== null && fiveHour.used_percentage > state.lastUsed) {
          pet.bus.emit('xp', { amount: (fiveHour.used_percentage - state.lastUsed) * XP_PER_PERCENT, reason: 'claude' });
        }
        state.lastUsed = fiveHour.used_percentage;
      }

      const level = levelFor(used);
      pet.send({ type: 'energy', rest: level >= 2 ? 'sleepy' : 'idle', tired: level >= 1, pose: POSES[level], instant: !announce });
      if (announce && level !== state.level) {
        const back = hourText(usage.worst.resets_at);
        if (level === 0) {
          pet.wake();
          pet.play('hop');
          pet.setMood('happy', 3000);
          pet.say('Mon énergie est revenue !', { duration: 4000 });
        } else if (level === 3) {
          pet.say(`KO... ton quota Claude est vide.${back ? ` Je ressuscite ${back}.` : ''}`, { duration: 7000 });
        } else if (level > state.level) {
          pet.play('stretch');
          pet.say(level === 2
            ? `Je m'assois un peu... ${Math.round(used)} % de ton quota Claude est utilisé.`
            : `Je commence à fatiguer : ${Math.round(used)} % de ton quota Claude est utilisé.`, { duration: 5000 });
        }
      }
      state.level = level;
      pet.settings.set('quota', state);
    }

    pet.bus.once('ready', () => {
      ready = true;
      setTimeout(() => apply(false), 2000);
    });

    fs.watchFile(USAGE_FILE, { interval: 5000 }, () => { if (ready) apply(true); });
    // Les fenêtres de quota se remettent à zéro même sans nouvelle lecture.
    const recheck = setInterval(() => { if (ready) apply(true); }, 60 * 1000);
    // Un bâillement de temps en temps quand il est fatigué.
    const yawn = setInterval(() => {
      if (state.level >= 1 && state.level < 3 && Math.random() < 0.3) {
        pet.play('stretch');
        pet.say(YAWNS[Math.floor(Math.random() * YAWNS.length)], { duration: 2500 });
      }
    }, 4 * 60 * 1000);

    pet.addMenuItems(() => [{
      label: 'Fatigue selon mon quota Claude',
      type: 'checkbox',
      checked: isConnected(),
      click: async () => {
        const wasOn = isConnected();
        try {
          const res = await pet.tools.run(wasOn ? 'debrancher-quota-claude' : 'brancher-quota-claude');
          if (res.refused) return;
          if (res.conflict) {
            pet.say('Claude Code a déjà une barre d\'état à toi : je n\'y touche pas.', { duration: 6000 });
          } else if (wasOn) {
            pet.send({ type: 'energy', rest: 'idle', tired: false, pose: '' });
            state.level = 0;
            pet.say('D\'accord, je ne regarde plus ton quota.', { duration: 4000 });
          } else {
            pet.play('hop');
            pet.say('C\'est branché ! Je verrai ton quota dès ta prochaine utilisation de Claude Code.', { duration: 6000 });
          }
        } catch (err) {
          pet.say(`Je n'ai pas pu lire les réglages de Claude Code : ${err.message}`, { duration: 6000 });
        }
      },
    }]);

    return () => {
      fs.unwatchFile(USAGE_FILE);
      clearInterval(recheck);
      clearInterval(yawn);
    };
  },
};
