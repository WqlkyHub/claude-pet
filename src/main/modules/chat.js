// Discussion avec Claude, sans fenêtre : un clic active le compagnon, une
// petite ligne apparaît pour écrire, et la réponse s'affiche dans sa propre
// bulle (voir la partie « Parler avec Claude » de src/renderer/pet.js).
// Chaque demande passe par l'aiguilleur (src/main/router.js).
//
// Deux façons de joindre Claude, au choix dans le menu :
//   - ton abonnement Claude (par défaut), via Claude Code installé sur le PC :
//     compte dans ton quota, rien n'est facturé à l'usage ;
//   - ta clé API : facturée à l'usage. Utilisée seulement si tu la choisis, ou
//     en secours quand l'abonnement est à bout, si tu as coché cette option.
const { ipcMain } = require('electron');
const router = require('../router');
const chatDestination = require('../destinations/chat');
const subscription = require('../destinations/abonnement');
const secrets = require('../secrets');

// La conversation et les souvenirs sont gardés par le module memoire
// (même après un redémarrage) : chaque demande est rangée dans un projet.

module.exports = {
  name: 'chat',
  setup(pet) {
    const via = () => pet.settings.get('claudeVia', 'abonnement'); // 'abonnement' | 'api'
    const apiFallback = () => pet.settings.get('apiFallback', false);
    let subStatus = null; // { installed, loggedIn } de Claude Code
    const refreshStatus = () => subscription.status().then((st) => { subStatus = st; }).catch(() => {});

    router.register('chat', {
      description: 'Discussion, questions, conseils, explications',
      async handle(request, io) {
        if (via() === 'api') return chatDestination.handle(request, io);
        let wrote = false;
        const watched = { ...io, onText: (d) => { wrote = true; io.onText(d); } };
        try {
          return await subscription.handle(request, watched);
        } catch (err) {
          // Secours par la clé API, seulement si tu l'as autorisé.
          if (!err.aborted && !wrote && apiFallback() && secrets.hasApiKey()
            && ['quota', 'missing', 'login'].includes(err.kind)) {
            return chatDestination.handle(request, io);
          }
          throw err;
        }
      },
    });
    pet.bus.once('ready', refreshStatus);

    let current = null; // AbortController de la réponse en cours
    let lastProject = null;
    const resetAt = () => pet.settings.get('chatResetAt', 0);

    pet.addMenuItems(() => [
      { label: 'Parler avec Claude', click: () => pet.send({ type: 'ask-open' }) },
      { label: 'Nouvelle conversation', click: () => pet.settings.set('chatResetAt', Date.now()) },
      {
        label: via() === 'api' ? 'Claude passe par : clé API' : 'Claude passe par : ton abonnement',
        submenu: [
          {
            label: 'Ton abonnement Claude (via Claude Code)', type: 'radio', checked: via() !== 'api',
            click: () => { pet.settings.set('claudeVia', 'abonnement'); refreshStatus(); },
          },
          { label: `      ${subLabel()}`, enabled: false },
          {
            label: 'Ta clé API (facturée à l\'usage)', type: 'radio', checked: via() === 'api',
            click: () => pet.settings.set('claudeVia', 'api'),
          },
          { type: 'separator' },
          {
            label: 'Abonnement à bout : passer par la clé API', type: 'checkbox',
            checked: apiFallback(), enabled: secrets.hasApiKey(),
            click: (item) => pet.settings.set('apiFallback', item.checked),
          },
          { type: 'separator' },
          { label: secrets.hasApiKey() ? 'Changer la clé API...' : 'Ajouter une clé API...', click: () => pet.send({ type: 'ask-open', mode: 'key' }) },
          { label: 'Oublier la clé API', enabled: secrets.hasApiKey(), click: () => secrets.forgetApiKey() },
        ],
      },
    ]);
    pet.bus.on('context-menu', refreshStatus);

    function subLabel() {
      if (!subStatus) return 'Claude Code : vérification...';
      if (!subStatus.installed) return 'Claude Code : pas installé';
      if (subStatus.loggedIn === false) return 'Claude Code : pas connecté (tape claude puis /login)';
      return 'Claude Code : prêt';
    }

    // Avec l'abonnement, pas besoin de clé : on ne la demande que pour la voie API.
    ipcMain.handle('chat:state', () => ({ hasKey: via() !== 'api' || secrets.hasApiKey() }));

    ipcMain.handle('chat:save-key', async (_e, apiKey) => {
      const key = String(apiKey || '').trim();
      if (!/^sk-ant-/.test(key)) {
        return { ok: false, message: 'Ça ne ressemble pas à une clé API (elle commence par « sk-ant- »).' };
      }
      const check = await chatDestination.checkKey(key);
      if (!check.ok) return check;
      try {
        secrets.setApiKey(key);
      } catch (err) {
        return { ok: false, message: err.message };
      }
      pet.play('hop');
      return { ok: true };
    });

    ipcMain.on('chat:cancel', () => {
      if (current) current.abort();
    });

    ipcMain.on('chat:ask', async (_e, { id, text }) => {
      if (current) current.abort();
      const controller = new AbortController();
      current = controller;

      const io = {
        signal: controller.signal,
        onText: (delta) => pet.send({ type: 'chat-delta', id, delta }),
        onMood: (mood) => pet.setMood(mood, 4000),
        onStatus: (status) => pet.send({ type: 'chat-status', id, status }),
        onReset: () => pet.send({ type: 'chat-reset', id }),
      };

      try {
        const { history, memory, search } = pet.memory.prepare(text, { sinceReset: resetAt() });
        const result = await router.dispatch({ text, history, memory, search }, io);
        if (result.refused) {
          pet.send({ type: 'chat-error', id, message: 'Je préfère ne pas répondre à ça.' });
          pet.setMood('surprised', 2500);
          return;
        }
        let projet = null;
        try {
          const p = pet.memory.record({ text, reply: result.reply, tags: result.tags });
          // On ne montre où c'est rangé que quand le sujet change.
          if (p.nom !== lastProject && p.nom !== 'Discussions') projet = p.nom;
          lastProject = p.nom;
        } catch (err) {
          console.error('Impossible de ranger cet échange :', err);
        }
        pet.send({ type: 'chat-done', id, projet });
        pet.setMood(result.mood, 4000);
        if (result.mood === 'happy' || result.mood === 'love') pet.play('hop');
        pet.bus.emit('xp', { amount: 3, reason: 'discussions' });
      } catch (err) {
        const info = err.needsKey
          ? { message: 'Il me faut ta clé API Anthropic pour parler avec Claude.', needsKey: true }
          : err.aborted ? { aborted: true }
            : err.friendly ? { message: err.friendly }
              : chatDestination.friendlyError(err);
        if (err.kind) refreshStatus();
        if (info.aborted) {
          pet.send({ type: 'chat-done', id });
          pet.setMood('idle');
        } else {
          pet.send({ type: 'chat-error', id, ...info });
          pet.setMood('dizzy', 2000);
        }
      } finally {
        if (current === controller) current = null;
      }
    });

    return () => {
      if (current) current.abort();
    };
  },
};
