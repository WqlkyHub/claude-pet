// Évolution : le compagnon gagne de l'expérience avec ce que vous faites ensemble
// et change de forme comme une espèce qui évolue :
// axolotl → dragon → dragon céleste.
//
// D'autres modules peuvent lui donner de l'expérience avec :
//   pet.bus.emit('xp', { amount: 5, reason: 'code' });
// Les raisons sont comptées dans `traits` : elles serviront plus tard à des
// évolutions différentes selon tes activités (coder, musique, jeux...).
const { powerMonitor } = require('electron');

const STAGES = [
  { stage: 1, label: 'Axolotl', name: 'un axolotl', xp: 0 },
  { stage: 2, label: 'Dragon', name: 'un dragon', xp: 400 },
  { stage: 3, label: 'Dragon céleste', name: 'un dragon céleste', xp: 2000 },
];

const XP = {
  clicked: 1,
  'double-clicked': 2,
  petted: 5,
  activeMinute: 0.4, // une minute passée ensemble pendant que tu utilises l'ordi
  newDay: 10, // premier lancement de la journée
};

function stageFor(xp) {
  return [...STAGES].reverse().find((s) => xp >= s.xp);
}

module.exports = {
  name: 'evolution',
  setup(pet) {
    const state = { xp: 0, traits: {}, lastDay: null, ...pet.settings.get('evolution', {}) };
    let current = stageFor(state.xp);
    let lastClickXp = 0;
    let previewTimer = null;

    const save = () => pet.settings.set('evolution', state);

    function gain(amount, reason) {
      state.xp = Math.round((state.xp + amount) * 10) / 10;
      if (reason) state.traits[reason] = (state.traits[reason] || 0) + amount;
      const next = stageFor(state.xp);
      if (next.stage > current.stage) {
        current = next;
        clearTimeout(previewTimer);
        pet.send({ type: 'evolve', stage: next.stage, name: next.name });
        pet.bus.emit('evolved', next);
      }
      save();
    }

    pet.bus.once('ready', () => {
      pet.send({ type: 'stage', stage: current.stage });
      const today = new Date().toDateString();
      if (state.lastDay !== today) {
        state.lastDay = today;
        setTimeout(() => gain(XP.newDay, 'jours'), 8000);
      }
    });

    pet.bus.on('clicked', () => {
      // pas d'expérience en cliquant à la chaîne
      if (Date.now() - lastClickXp < 3000) return;
      lastClickXp = Date.now();
      gain(XP.clicked, 'jeux');
    });
    pet.bus.on('double-clicked', () => gain(XP['double-clicked'], 'jeux'));
    pet.bus.on('petted', () => gain(XP.petted, 'câlins'));
    pet.bus.on('xp', ({ amount, reason }) => gain(amount, reason));

    const timer = setInterval(() => {
      if (powerMonitor.getSystemIdleTime() < 60) gain(XP.activeMinute, 'temps ensemble');
    }, 60 * 1000);

    pet.addMenuItems(() => {
      const next = STAGES.find((s) => s.stage === current.stage + 1);
      const progress = next ? `${Math.floor(state.xp)} / ${next.xp} XP` : `${Math.floor(state.xp)} XP, stade max`;
      return [
        { label: `${current.label} · ${progress}`, enabled: false },
        {
          label: 'Voir ses stades',
          submenu: STAGES.map((s) => ({
            label: s.label,
            click: () => {
              // simple aperçu pendant quelques secondes, sans changer sa progression
              clearTimeout(previewTimer);
              pet.send({ type: 'stage', stage: s.stage });
              previewTimer = setTimeout(() => pet.send({ type: 'stage', stage: current.stage }), 6000);
            },
          })),
        },
      ];
    });

    return () => {
      clearInterval(timer);
      save();
    };
  },
};
