// Conscience de ton activité : le compagnon sait sur quel logiciel tu es, depuis
// combien de temps, si tu es là ou pas, et quelle heure il est. Il réagit
// surtout sans parler (lunettes quand tu codes, casque et petites notes quand
// tu écoutes de la musique, il se tait quand tu es en plein écran) et fait
// très rarement une remarque (pause après une longue séance, il est tard...).
//
// Tout reste sur ton ordinateur : rien n'est envoyé à Claude ni ailleurs. Seuls
// les minutes par catégorie de la journée sont enregistrées, jamais les titres
// de fenêtres. Lecture seule : rien n'est modifié sur l'ordinateur.
//
// Pour les autres modules :
//   pet.activity.current()   { category, label, app, title, full, music, minutes }
//   pet.activity.today()     { code: 42, musique: 15, ... } minutes du jour
//   pet.bus.on('activity', (info) => ...)  quand tu changes de catégorie
const { powerMonitor } = require('electron');
const watcher = require('../activity/watcher');
const { classify, byId } = require('../activity/categories');

// Écart minimum entre deux remarques, selon le réglage du menu.
const REMARK_GAP = { rares: 60, normales: 25, jamais: Infinity }; // minutes
const FOCUS = ['code', 'travail', 'creation', 'jeu', 'video']; // longues séances qui méritent une pause
const PAUSE_AFTER = 90; // minutes d'affilée avant de proposer une pause
const PAUSE_AGAIN = 60; // puis au plus une fois par heure
const AWAY_BREAKS_SESSION = 5; // minutes ailleurs (ou absent) qui terminent une séance
const GLASSES_AFTER = 10; // minutes de code avant de mettre ses lunettes
const IDLE_SECONDS = 60; // au-delà, tu n'es pas considéré comme actif
const MINUTE = Number(process.env.CLAUDE_PET_MINUTE_MS) || 60 * 1000; // raccourci pour les tests

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function duration(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

const PAUSE_LINES = [
  (d, verb) => `Ça fait ${d} que ${verb}. Une petite pause ?`,
  (d) => `${d} d'affilée ! On s'étire un peu ?`,
  (d) => `${d} sans lever la tête... un verre d'eau ?`,
];
const LATE_LINES = [
  'Minuit passé... on se couche bientôt ?',
  'Il est tard ! Moi je commence à piquer du nez.',
];
const AFTER_GAME = ['Alors, cette partie ?', 'Bien joué ? Raconte !', 'De retour du jeu !'];
const CLAUDE_LINES = ['Oh, tu parles à Claude ! Dis-lui bonjour de ma part.', 'Tiens, un collègue !'];

module.exports = {
  name: 'activity',
  setup(pet) {
    const cfg = () => ({ track: true, remarks: 'rares', ...pet.settings.get('activity', {}) });
    const saveCfg = (patch) => pet.settings.set('activity', { ...cfg(), ...patch });

    // Ce qui est au premier plan maintenant.
    let win = null; // dernière fenêtre lue { app, path, pid, title, full, music }
    let category = null; // catégorie de la fenêtre active
    // Séance en cours : même catégorie, en tolérant de courts passages ailleurs.
    let session = { cat: null, minutes: 0, away: 0 };
    let lastRemark = 0;
    let lastPauseNudge = 0;
    let lastNotes = 0;
    let gear = '';
    let stopWatcher = null;
    let today = pet.settings.get('activity-today', { day: new Date().toDateString(), minutes: {} });

    const idle = () => powerMonitor.getSystemIdleTime();

    // --- Remarques : rares, jamais en plein écran, jamais quand tu es absent ---
    function canRemark() {
      const gap = REMARK_GAP[cfg().remarks] ?? REMARK_GAP.rares;
      if (!Number.isFinite(gap)) return false;
      if (win && win.full) return false;
      if (idle() > 30) return false;
      return Date.now() - lastRemark >= gap * MINUTE;
    }

    function remark(text, { mood, animation, duration: ms = 5000 } = {}) {
      if (!canRemark()) return false;
      lastRemark = Date.now();
      if (animation) pet.play(animation);
      if (mood) pet.setMood(mood, { duration: ms });
      // ambient : le rendu l'ignore si tu es en train de lui parler ou s'il dort.
      pet.send({ type: 'say', text, duration: ms, ambient: true });
      return true;
    }

    // --- Accessoires : lunettes quand tu codes, casque quand il y a de la musique ---
    function updateGear() {
      const items = [];
      if (session.cat === 'code' && session.minutes >= GLASSES_AFTER) items.push('glasses');
      if ((win && win.music) || category === 'musique') items.push('headphones');
      const next = items.join(' ');
      if (next === gear) return;
      gear = next;
      pet.send({ type: 'gear', items });
      pet.send({ type: 'groove', on: items.includes('headphones') });
    }

    // --- Plein écran : il reste affiché (tu le caches toi-même si tu veux),
    // mais il se tait pour ne pas gêner le jeu ou le film ---
    function updateVisibility() {
      pet.send({ type: 'quiet', on: Boolean(win && win.full) });
    }

    function onWindow(next) {
      if (!next || next.pid === process.pid) return; // c'est lui-même
      const before = win;
      win = next;
      const cat = classify(next).id;
      const changed = cat !== category;
      const previous = category;
      category = cat;

      // Nouveau morceau sur Spotify : quelques notes flottent, sans un mot.
      if (next.music && (!before || before.music !== next.music) && Date.now() - lastNotes > 3 * MINUTE) {
        lastNotes = Date.now();
        pet.send({ type: 'notes' });
      }

      if (changed) {
        pet.bus.emit('activity', api.current());
        // Retour d'une vraie session de jeu.
        if (previous === 'jeu' && session.cat === 'jeu' && session.minutes >= 20 && !next.full) {
          remark(pick(AFTER_GAME), { mood: 'happy', animation: 'hop', duration: 4000 });
        }
        // Premier passage de la journée sur Claude.
        if (cat === 'claude' && today.claudeSeen !== today.day) {
          if (remark(pick(CLAUDE_LINES), { mood: 'love', animation: 'wiggle', duration: 4000 })) {
            today.claudeSeen = today.day;
          }
        }
      }
      updateVisibility();
      updateGear();
    }

    // --- Chaque minute : temps passé, séances, pause, heure tardive ---
    function everyMinute() {
      const day = new Date().toDateString();
      if (today.day !== day) today = { day, minutes: {} };
      const active = idle() < IDLE_SECONDS || (win && win.full); // un film en plein écran compte
      if (active && category) {
        today.minutes[category] = (today.minutes[category] || 0) + 1;
        pet.bus.emit('xp', { amount: 0.1, reason: category }); // nourrit les futures évolutions par activité
        if (category === session.cat) {
          session.minutes++;
          session.away = 0;
        } else if (++session.away >= AWAY_BREAKS_SESSION || !session.cat) {
          session = { cat: category, minutes: session.away, away: 0 };
        }
      } else if (++session.away >= AWAY_BREAKS_SESSION) {
        session = { cat: null, minutes: 0, away: 0 };
      }
      pet.settings.set('activity-today', today);

      const now = Date.now();
      if (FOCUS.includes(session.cat) && session.minutes >= PAUSE_AFTER && idle() < 30
        && now - lastPauseNudge >= PAUSE_AGAIN * MINUTE) {
        const line = pick(PAUSE_LINES)(duration(session.minutes), byId(session.cat).verb);
        if (remark(line, { mood: 'sleepy', animation: 'stretch', duration: 6000 })) lastPauseNudge = now;
      }

      const hour = new Date().getHours();
      if (hour < 4 && active && today.lateSaid !== day) {
        if (remark(pick(LATE_LINES), { mood: 'sleepy', animation: 'stretch', duration: 5000 })) today.lateSaid = day;
      }
      updateGear();
    }

    const api = {
      current() {
        if (!win || !category) return null;
        const c = byId(category);
        return {
          category, label: c.label, app: win.app, title: win.title, full: Boolean(win.full),
          music: win.music || '', minutes: session.cat === category ? session.minutes : 0,
        };
      },
      today: () => ({ ...today.minutes }),
    };
    pet.activity = api;

    function startTracking() {
      if (stopWatcher) return;
      stopWatcher = watcher.start(onWindow, (err) => console.warn('[activité]', err.message));
    }
    function stopTracking() {
      if (stopWatcher) stopWatcher();
      stopWatcher = null;
      win = null;
      category = null;
      session = { cat: null, minutes: 0, away: 0 };
      updateVisibility();
      updateGear();
    }

    pet.bus.once('ready', () => { if (cfg().track) startTracking(); });
    const timer = setInterval(everyMinute, MINUTE);

    pet.addMenuItems(() => {
      const c = cfg();
      const cur = api.current();
      const head = !c.track ? 'Ce que tu fais : pas suivi'
        : cur ? `Ce que tu fais : ${cur.label}${cur.minutes >= 1 ? ` · ${duration(cur.minutes)}` : ''}`
          : 'Ce que tu fais : ...';
      const totals = Object.entries(today.minutes)
        .filter(([, m]) => m >= 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, m]) => ({ label: `${byId(id).label} : ${duration(m)}`, enabled: false }));
      const level = (id, label) => ({
        label, type: 'radio', checked: c.remarks === id, click: () => saveCfg({ remarks: id }),
      });
      return [{
        label: head,
        submenu: [
          { label: 'Aujourd\'hui', enabled: false },
          ...(totals.length ? totals : [{ label: 'rien encore', enabled: false }]),
          { type: 'separator' },
          {
            label: 'Suivre ce que je fais', type: 'checkbox', checked: c.track,
            click: (item) => { saveCfg({ track: item.checked }); if (item.checked) startTracking(); else stopTracking(); },
          },
          { type: 'separator' },
          { label: 'Ses remarques', enabled: false },
          level('rares', 'Rares'),
          level('normales', 'De temps en temps'),
          level('jamais', 'Jamais'),
        ],
      }];
    });

    return () => {
      clearInterval(timer);
      if (stopWatcher) stopWatcher();
      pet.settings.set('activity-today', today);
    };
  },
};
