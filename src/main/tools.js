// Registre des « outils » que le compagnon (et plus tard Claude) pourra utiliser :
// chercher des fichiers, diagnostiquer un problème, lancer un logiciel...
//
// Règle : un outil qui modifie quelque chose sur l'ordinateur (`modifies: true`)
// demande toujours l'autorisation avant de s'exécuter. Les outils en lecture seule
// s'exécutent directement.
//
//   pet.tools.register('chercher-fichier', {
//     description: 'Cherche un fichier par son nom',
//     modifies: false,
//     run: async ({ nom }) => { ... return résultat; },
//   });
//   await pet.tools.run('chercher-fichier', { nom: 'facture.pdf' });

const { dialog, BrowserWindow } = require('electron');

const registry = new Map();

function register(name, tool) {
  if (typeof tool.run !== 'function') throw new Error(`L'outil ${name} n'a pas de fonction run`);
  registry.set(name, { modifies: true, ...tool }); // par prudence, « modifie » par défaut
}

function list() {
  return [...registry].map(([name, t]) => ({ name, description: t.description, modifies: t.modifies }));
}

async function askPermission(name, tool, args) {
  const win = BrowserWindow.getAllWindows()[0];
  const summary = tool.describe ? tool.describe(args) : `${tool.description || name}`;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Claude Pet demande ton accord',
    message: 'Je peux faire ça ?',
    detail: summary,
    buttons: ['Oui, vas-y', 'Non'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
}

async function run(name, args = {}) {
  const tool = registry.get(name);
  if (!tool) throw new Error(`Outil inconnu : ${name}`);
  if (tool.modifies && !(await askPermission(name, tool, args))) {
    return { refused: true };
  }
  return tool.run(args);
}

module.exports = { register, list, run };
