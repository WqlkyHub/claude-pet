// Mémoire du compagnon : il garde ce que tu lui demandes (même après un
// redémarrage), le range par projet comme tu le ferais avec Claude, retient ce
// que tu lui dis de durable, et peut relire ce que vous avez fait avant :
// avec lui, dans Claude Code sur ce PC, et sur claude.ai si tu importes ton export.
//
// Expose pet.memory au module chat :
//   pet.memory.prepare(texte)   → { memory, search, history } avant de répondre
//   pet.memory.record(...)      → range l'échange, retient les souvenirs
const path = require('path');
const { app, dialog, shell, BrowserWindow } = require('electron');
const store = require('../memory/store');
const context = require('../memory/context');
const claudeCode = require('../memory/claude-code');
const claudeAi = require('../memory/claude-ai');
const subscription = require('../destinations/abonnement');
const chatDestination = require('../destinations/chat');

const SUMMARY_EVERY = 6; // on remet à jour le résumé d'un projet toutes les 6 demandes

// Ce qu'il sait déjà en arrivant : le projet où il est né.
const SEED = {
  nom: 'Claude Pet',
  resume: 'Le compagnon de bureau que Sacha construit avec Claude (app Electron pour Windows) : un axolotl orange en pixel art '
    + 'qui évolue en dragon puis en dragon céleste, toujours au premier plan, qui discute par l\'abonnement Claude via Claude Code, '
    + 'fatigue avec le quota, réagit à l\'activité (lunettes quand Sacha code, casque avec la musique) et garde maintenant une mémoire '
    + 'rangée par projet. Prochaines étapes : lancer musique, logiciels et sites ; chercher des fichiers et diagnostiquer des problèmes ; '
    + 'choisir tout seul entre discussion, Claude Code et Cowork.',
};

module.exports = {
  name: 'memoire',
  setup(pet) {
    store.init(path.join(app.getPath('userData'), 'memoire'));
    if (!pet.settings.get('memorySeeded')) {
      store.ensureProject(SEED.nom, SEED.resume);
      pet.settings.set('memorySeeded', true);
    }

    const useClaudeCode = () => pet.settings.get('memoryClaudeCode', true);
    const pinned = () => pet.settings.get('memoryPinned', null); // nom de projet imposé, ou null
    const via = () => pet.settings.get('claudeVia', 'abonnement');

    // Remet à jour le résumé d'un projet, en arrière-plan, sans déranger.
    const summarizing = new Set();
    async function refreshSummary(p) {
      if (summarizing.has(p.id) || (p.depuisResume || 0) < SUMMARY_EVERY) return;
      summarizing.add(p.id);
      try {
        const last = store.readExchanges(p.id).slice(-20)
          .map((e) => `Sacha : ${e.moi}\nClaude : ${e.toi}`).join('\n\n');
        const system = 'Tu tiens le carnet de projets de Sacha. Réponds uniquement par le nouveau résumé, en français, '
          + 'en 2 à 4 phrases : de quoi parle le projet, ce qui a été fait ou décidé, ce qui reste à faire. Pas de markdown.';
        const prompt = `Écris le nouveau résumé du projet « ${p.nom} » à partir de ces éléments.\n\n`
          + `Résumé actuel : ${p.resume || '(aucun)'}\n\nDerniers échanges du projet :\n${last}\n\nNouveau résumé :`;
        const resume = via() === 'api' ? await chatDestination.complete(system, prompt) : await subscription.complete(system, prompt);
        if (resume) store.setSummary(p.id, resume.replace(/\s+/g, ' ').slice(0, 800));
      } catch { /* on réessaiera à la prochaine demande */ } finally {
        summarizing.delete(p.id);
      }
    }

    pet.memory = {
      prepare(text, { sinceReset = 0 } = {}) {
        const history = context.recentHistory({ sinceReset })
          .flatMap((e) => [{ role: 'user', content: e.moi }, { role: 'assistant', content: e.toi }]);
        let memory = '';
        try { memory = context.build(text, { useClaudeCode: useClaudeCode(), pinned: pinned() }); } catch (err) {
          console.error('Mémoire illisible :', err);
        }
        const dirs = useClaudeCode() ? [claudeCode.PROJECTS_DIR] : [];
        return {
          history,
          memory,
          search: { cwd: store.dir(), dirs, help: context.searchHelp({ useClaudeCode: useClaudeCode() }) },
        };
      },
      record({ text, reply, tags = {} }) {
        const projet = pinned() || tags.projet || 'Discussions';
        const p = store.record({ projet, moi: text, toi: reply });
        for (const fact of tags.retenir || []) store.remember(fact, p.nom);
        refreshSummary(p);
        return p;
      },
      // Nouvelles de Claude (dans l'app) : ses projets avec Sacha et ce qui s'y est fait.
      receiveHistory(h) {
        store.saveHistory(h);
        for (const p of h.projets || []) {
          if (p && p.nom && !store.findProject(p.nom)) store.ensureProject(p.nom, p.resume || '');
        }
      },
      dir: () => store.dir(),
    };

    async function importClaudeAi() {
      const win = BrowserWindow.getAllWindows()[0];
      await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Importer ton historique claude.ai',
        message: 'Je vais lire ton export claude.ai.',
        detail: 'Si tu ne l\'as pas encore : sur claude.ai, Paramètres → Confidentialité → « Exporter les données ». '
          + 'Tu reçois un e-mail avec un fichier .zip : dézippe-le, puis choisis le fichier conversations.json qu\'il contient.\n\n'
          + 'Je ne fais que le lire et j\'en range une copie dans ma mémoire ; ton fichier n\'est pas modifié.',
        buttons: ['Choisir le fichier'],
        noLink: true,
      });
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Choisis conversations.json',
        filters: [{ name: 'Export claude.ai', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (canceled || !filePaths.length) return;
      pet.setMood('thinking');
      try {
        const res = claudeAi.importExport(filePaths[0], store.dir());
        pet.play('hop');
        pet.say(`J'ai lu tes ${res.discussions} discussions claude.ai${res.projets ? ` et tes ${res.projets} projets` : ''}. Je m'en souviendrai !`, { duration: 6000 });
      } catch (err) {
        pet.setMood('dizzy', 2000);
        pet.say(`Je n'arrive pas à lire ce fichier : ${err.message}`, { duration: 6000 });
      }
    }

    async function forgetAll() {
      const win = BrowserWindow.getAllWindows()[0];
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Claude Pet demande ton accord',
        message: 'J\'oublie tout ce que tu m\'as demandé ?',
        detail: 'Ça efface ma mémoire (projets, demandes, souvenirs, copie de l\'export claude.ai). '
          + 'Tes sessions Claude Code et ton compte claude.ai ne sont pas touchés.',
        buttons: ['Oui, tout oublier', 'Non'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) return;
      store.forgetAll();
      pet.settings.set('memoryPinned', null);
      pet.setMood('dizzy', 2500);
      pet.say('Pouf... Tout est oublié.', { duration: 4000 });
    }

    pet.addMenuItems(() => {
      const projects = store.listProjects().slice(0, 12);
      const ai = claudeAi.readIndex(store.dir());
      return [{
        label: 'Mémoire',
        submenu: [
          {
            label: 'Ranger mes demandes tout seul', type: 'radio', checked: !pinned(),
            click: () => pet.settings.set('memoryPinned', null),
          },
          ...projects.map((p) => ({
            label: `Tout ranger dans « ${p.nom} » (${p.echanges || 0})`, type: 'radio', checked: pinned() === p.nom,
            click: () => pet.settings.set('memoryPinned', p.nom),
          })),
          { type: 'separator' },
          {
            label: 'Relire mes sessions Claude Code', type: 'checkbox', checked: useClaudeCode(),
            click: (item) => pet.settings.set('memoryClaudeCode', item.checked),
          },
          {
            label: ai ? `Réimporter mon historique claude.ai (${ai.discussions.length} discussions)...` : 'Importer mon historique claude.ai...',
            click: importClaudeAi,
          },
          { type: 'separator' },
          { label: 'Ouvrir ma mémoire', click: () => shell.openPath(path.join(store.dir(), 'Projets')) },
          { label: 'Tout oublier...', click: forgetAll },
        ],
      }];
    });
  },
};
