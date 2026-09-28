// Mises à jour en un clic : au démarrage puis toutes les 6 heures, le
// compagnon regarde si une nouvelle version existe (voir src/main/update.js).
// Si oui, il te le dit et te demande ton accord ; un clic sur « Mettre à jour »
// suffit : il se met à jour et redémarre. Rien ne change sans ton accord.
const { app, dialog, BrowserWindow } = require('electron');
const update = require('../update');

const EVERY_MS = 6 * 3600 * 1000;
const FIRST_CHECK_MS = 20 * 1000; // on le laisse se réveiller d'abord

module.exports = {
  name: 'mise-a-jour',
  setup(pet) {
    let found = null; // { version, nouveautes }
    let busy = false;

    async function ask(info) {
      const win = BrowserWindow.getAllWindows()[0];
      const list = info.nouveautes.length ? info.nouveautes.map((n) => `• ${n}`).join('\n') : 'Des améliorations.';
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Claude Pet demande ton accord',
        message: `Une nouvelle version de Claude Pet est prête (${info.version}). Je me mets à jour ?`,
        detail: `Nouveautés :\n${list}\n\nÇa prend quelques secondes, puis je redémarre. Tes réglages et ma mémoire sont gardés.`,
        buttons: ['Mettre à jour', 'Plus tard'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) {
        pet.settings.set('updateSnoozed', { version: info.version, until: Date.now() + 24 * 3600 * 1000 });
        return;
      }
      await apply(info);
    }

    async function apply(info) {
      if (busy) return;
      busy = true;
      pet.setMood('thinking');
      try {
        const version = await update.install((step) => pet.say(step, { duration: 20000 }));
        pet.settings.set('justUpdated', { version, nouveautes: info.nouveautes });
        pet.say('C\'est bon, je redémarre !', { duration: 3000 });
        setTimeout(() => { app.relaunch(); app.exit(0); }, 1500);
      } catch (err) {
        busy = false;
        pet.setMood('dizzy', 2500);
        pet.say(`La mise à jour a raté : ${err.message}`, { duration: 8000 });
      }
    }

    // L'historique envoyé par Claude, rangé dans sa mémoire (sans redémarrer).
    async function syncHistory() {
      try {
        const h = await update.fetchHistory(pet.settings.get('historyMaj', null));
        if (!h || !pet.memory) return;
        pet.memory.receiveHistory(h);
        pet.settings.set('historyMaj', h.maj);
      } catch { /* pas de nouvelles, ou pas d'internet : pas grave */ }
    }

    async function check({ manual = false } = {}) {
      if (busy) return;
      syncHistory();
      try {
        found = await update.check();
      } catch (err) {
        if (manual) pet.say('Je n\'arrive pas à vérifier les mises à jour. Tu es bien connecté à internet ?', { duration: 6000 });
        return;
      }
      if (!found) {
        if (manual) pet.say(update.source() ? 'Je suis déjà à jour !' : 'Aucune source de mises à jour n\'est réglée.', { duration: 4000 });
        return;
      }
      const snooze = pet.settings.get('updateSnoozed', null);
      if (!manual && snooze && snooze.version === found.version && Date.now() < snooze.until) return;
      pet.play('hop');
      pet.say('J\'ai des nouveautés pour toi !', { duration: 4000 });
      setTimeout(() => ask(found), 1200);
    }

    // Après une mise à jour : il te dit ce qui a changé.
    pet.bus.once('ready', () => {
      const just = pet.settings.get('justUpdated', null);
      if (!just) return;
      pet.settings.set('justUpdated', null);
      setTimeout(() => {
        pet.play('hop');
        const first = just.nouveautes && just.nouveautes[0];
        pet.say(`Me voilà en version ${just.version} !${first ? ` Nouveau : ${first}` : ''}`, { duration: 9000 });
      }, 3000);
    });

    const first = setTimeout(() => check(), FIRST_CHECK_MS);
    const timer = setInterval(() => check(), EVERY_MS);

    pet.addMenuItems(() => [{
      label: found ? `Mettre à jour (version ${found.version})...` : 'Rechercher une mise à jour',
      click: () => (found ? ask(found) : check({ manual: true })),
    }]);

    return () => { clearTimeout(first); clearInterval(timer); };
  },
};
