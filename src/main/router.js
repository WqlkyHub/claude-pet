// Aiguilleur : décide où envoyer chaque demande faite au compagnon.
//
// Une « destination » sait traiter une demande et renvoie sa réponse petit à
// petit. Aujourd'hui il n'y en a qu'une, `chat` (Claude via l'API). Les
// suivantes s'ajoutent ici sans toucher à la bulle de discussion :
//
//   router.register('code', {
//     description: 'Travail sur du code ou des fichiers du PC (Claude Code)',
//     handle: async (request, io) => { ... },
//   });
//
// Quand il y aura plusieurs destinations, `classify` demandera à Claude de
// choisir la bonne (une question rapide → chat, une tâche sur le code ou les
// fichiers → code, un long travail en plusieurs étapes → cowork).
//
// `request` : { text, history }
// `io`      : { onText(delta), onStatus(texte), signal } fournis par la bulle.

const destinations = new Map();
let classify = null; // async (request, destinations) => nom de destination

function register(name, destination) {
  if (typeof destination.handle !== 'function') {
    throw new Error(`La destination ${name} n'a pas de fonction handle`);
  }
  destinations.set(name, destination);
}

function setClassifier(fn) {
  classify = fn;
}

async function decide(request) {
  if (destinations.size === 0) throw new Error('Aucune destination enregistrée');
  if (destinations.size === 1 || !classify) {
    return destinations.has('chat') ? 'chat' : destinations.keys().next().value;
  }
  const choice = await classify(request, destinations);
  return destinations.has(choice) ? choice : 'chat';
}

async function dispatch(request, io) {
  const name = await decide(request);
  const result = await destinations.get(name).handle(request, io);
  return { destination: name, ...result };
}

module.exports = { register, setClassifier, decide, dispatch, destinations };
