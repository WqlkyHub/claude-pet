// Chargeur de modules. Chaque module ajoute un comportement au compagnon
// sans toucher au reste du code. Un module exporte :
//
//   module.exports = {
//     name: 'mon-module',
//     setup(pet) { ... ; return () => { /* nettoyage optionnel */ } },
//   };
//
// `pet` donne accès à :
//   pet.say(texte, { duration })   bulle de dialogue
//   pet.setMood(humeur, { duration })  idle | happy | love | surprised | sleepy | dizzy | thinking
//   pet.play(animation)            hop | wiggle | spin | stretch
//   pet.sleep() / pet.wake()
//   pet.bus                        événements : ready, clicked, double-clicked, petted,
//                                  dizzy, drag-start, drag-end, evolved
//   pet.settings                   get(clé, défaut) / set(clé, valeur)
//   pet.tools                      register / list / run : actions sur l'ordi,
//                                  avec demande d'accord si elles modifient quelque chose
//   pet.getWindow()                la BrowserWindow du compagnon
//   pet.send(commande)             commande brute au rendu (ex. { type: 'stage', stage: 3 })
//   pet.addMenuItems(() => [...])  ajoute des lignes au menu du clic droit
//   pet.bus.emit('xp', { amount, reason })  fait progresser son évolution
//   pet.activity.current() / today()  ce que tu fais en ce moment (module activity)
//   pet.bus.on('activity', ...)       quand tu changes d'activité
//
// chat.js ouvre la discussion avec Claude ; les demandes passent par
// l'aiguilleur src/main/router.js (chat aujourd'hui, Claude Code et Cowork ensuite).
// memoire.js garde tes demandes, rangées par projet, et relit ce que vous avez fait avant.
// activity.js suit la fenêtre active, l'inactivité et l'heure (en local).
// Étape prévue : actions.js (lancer musique, logiciels, sites).

const MODULES = [
  require('./greeting'),
  require('./presence'),
  require('./evolution'),
  require('./memoire'), // avant chat : chat s'en sert
  require('./chat'),
  require('./quota'),
  require('./activity'),
  require('./mise-a-jour'),
];

const cleanups = [];

function load(pet) {
  for (const mod of MODULES) {
    try {
      const cleanup = mod.setup(pet);
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    } catch (err) {
      console.error(`Le module ${mod.name} n'a pas pu démarrer :`, err);
    }
  }
}

function unload() {
  while (cleanups.length) {
    try { cleanups.pop()(); } catch { /* on quitte de toute façon */ }
  }
}

module.exports = { load, unload };
