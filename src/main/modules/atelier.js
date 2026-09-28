// L'atelier : le compagnon peut modifier son propre code quand tu le lui
// demandes (« mets-toi un chapeau », « parle moins souvent »...).
//
// Comment ça se passe, sans jamais toucher à rien avant ton accord :
//   1. il copie son code dans un atelier (%APPDATA%\claude-pet\atelier\) ;
//   2. Claude Code modifie CETTE COPIE (outils de lecture et d'écriture de
//      fichiers, limités à l'atelier ; aucune commande, rien sur internet) ;
//   3. il vérifie que les fichiers JavaScript modifiés sont valides ;
//   4. il te montre ce qu'il a changé et te demande ton accord ;
//   5. si tu dis oui, il garde une copie de sa version actuelle, recopie les
//      fichiers changés et redémarre. Menu « Annuler ma dernière modification »
//      (ou tools\restaurer.cmd s'il ne redémarre plus) pour revenir en arrière.
//
// Ces modifications restent sur ton PC : la prochaine mise à jour depuis
// GitHub les remplacera (elle te prévient). Pour les garder pour de bon,
// demande-les aussi à Claude dans le projet Claude Pet.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app, dialog, BrowserWindow } = require('electron');
const subscription = require('../destinations/abonnement');
const update = require('../update');

const TIMEOUT_MS = 10 * 60 * 1000;
const EDIT_TOOLS = 'Read,Edit,Write,Glob,Grep';

const SYSTEM = [
  'Tu es Claude, et tu modifies le code du compagnon de bureau « Claude Pet » (application Electron pour Windows) :',
  'c\'est toi-même, le petit axolotl orange en pixel art qui vit sur le bureau de Sacha.',
  'Le dossier de travail est une copie de ton code : modifie-la pour faire ce que Sacha demande.',
  'Règles :',
  '- Lis d\'abord README.md (partie « Organisation du code ») et les fichiers concernés avant de modifier.',
  '- Fais le changement le plus petit et le plus propre possible, dans le style du code existant (commentaires en français).',
  '- Ne touche pas aux dépendances de package.json, ni à node_modules, ni à la version.',
  '- Le dessin est un SVG dans src/renderer/index.html (styles dans style.css, comportement dans pet.js).',
  '- Ne mets rien qui lise ou envoie des données de Sacha ailleurs, et rien qui modifie son PC en dehors de toi-même.',
  '- Si la demande est impossible ou dangereuse, ne modifie rien et explique pourquoi.',
  'Termine par une seule phrase en français, sans markdown, qui dit à Sacha ce que tu as changé (ou pourquoi tu n\'as rien changé).',
].join('\n');

function hashFile(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(full, base, out);
    else if (e.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

function changedFiles(work, root) {
  return listFiles(work).filter((rel) => {
    const orig = path.join(root, rel);
    return !fs.existsSync(orig) || hashFile(orig) !== hashFile(path.join(work, rel));
  });
}

// Vérifie la syntaxe d'un fichier JavaScript avec le Node intégré à Electron.
function checkSyntax(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', file], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', () => resolve(null)); // on ne peut pas vérifier : on laisse passer
    child.on('close', (code) => resolve(code === 0 ? null : err.trim().split('\n').slice(0, 4).join('\n')));
  });
}

// Lance Claude Code sur la copie de travail. Renvoie sa phrase de résumé.
function runClaude(work, request, onStatus) {
  const exe = subscription.findClaude();
  if (!exe) return Promise.reject(new Error('il me faut Claude Code sur ce PC pour me modifier'));
  const promptFile = path.join(app.getPath('userData'), 'claude-pet-prompt-atelier.txt');
  fs.writeFileSync(promptFile, SYSTEM);
  const args = ['-p', '--output-format', 'stream-json', '--verbose',
    '--tools', EDIT_TOOLS, '--allowedTools', EDIT_TOOLS, '--permission-mode', 'acceptEdits',
    '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
    '--effort', 'medium', '--system-prompt-file', promptFile];
  return new Promise((resolve, reject) => {
    const child = subscription.run(exe, args, { cwd: work, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    let result = null;
    let errText = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
          for (const b of ev.message.content) {
            if (b.type === 'tool_use' && ['Edit', 'Write'].includes(b.name)) onStatus('J\'écris mon nouveau code…');
          }
        } else if (ev.type === 'result') {
          result = ev;
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { errText += c; });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', () => {
      clearTimeout(timer);
      if (!result || result.is_error) {
        reject(new Error((result && result.result) || errText.trim().slice(0, 200) || 'Claude Code s\'est arrêté'));
        return;
      }
      resolve(String(result.result || '').trim().split('\n').filter(Boolean).pop() || '');
    });
    child.stdin.end(`Demande de Sacha : ${request}`);
  });
}

module.exports = {
  name: 'atelier',
  setup(pet) {
    let busy = false;
    const say = (t, duration = 8000) => pet.say(t, { duration });

    async function confirm(summary, files) {
      const win = BrowserWindow.getAllWindows()[0];
      const shown = files.slice(0, 12).map((f) => `• ${f.replace(/\\/g, '/')}`).join('\n');
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Claude Pet demande ton accord',
        message: 'Je me suis préparé une modification. Je l\'applique ?',
        detail: `${summary}\n\nFichiers changés :\n${shown}${files.length > 12 ? `\n… et ${files.length - 12} autres` : ''}`
          + '\n\nJe garde une copie de ma version actuelle, puis je redémarre.',
        buttons: ['Appliquer', 'Annuler'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      return response === 0;
    }

    async function start(request) {
      if (busy) { say('Je suis déjà en train de me modifier, une chose à la fois !'); return; }
      busy = true;
      const work = path.join(app.getPath('userData'), 'atelier');
      try {
        pet.setMood('thinking');
        fs.rmSync(work, { recursive: true, force: true });
        fs.mkdirSync(work, { recursive: true });
        update.copyTree(update.ROOT, work);
        say('Je regarde mon code…', 60000);

        const summary = await runClaude(work, request, (s) => say(s, 60000));
        const files = changedFiles(work, update.ROOT);
        if (!files.length) {
          pet.setMood('idle');
          say(summary || 'Finalement, je n\'ai rien changé.', 9000);
          return;
        }
        for (const rel of files.filter((f) => f.endsWith('.js'))) {
          const problem = await checkSyntax(path.join(work, rel));
          if (problem) throw new Error(`mon nouveau code a une erreur dans ${rel}, je ne l'applique pas`);
        }
        pet.setMood('happy', 4000);
        say(summary, 9000);
        if (!(await confirm(summary, files))) {
          say('D\'accord, je ne change rien.', 4000);
          return;
        }
        const backup = path.join(app.getPath('userData'), 'version-precedente');
        fs.rmSync(backup, { recursive: true, force: true });
        fs.mkdirSync(backup, { recursive: true });
        update.copyTree(update.ROOT, backup);
        for (const rel of files) {
          fs.mkdirSync(path.dirname(path.join(update.ROOT, rel)), { recursive: true });
          fs.copyFileSync(path.join(work, rel), path.join(update.ROOT, rel));
        }
        const edits = pet.settings.get('localEdits', []);
        edits.push({ t: Date.now(), demande: request, resume: summary, fichiers: files });
        pet.settings.set('localEdits', edits.slice(-50));
        pet.settings.set('justEdited', summary);
        say('C\'est fait, je redémarre !', 3000);
        setTimeout(() => { app.relaunch(); app.exit(0); }, 1500);
      } catch (err) {
        pet.setMood('dizzy', 2500);
        say(`Je n'ai pas réussi à me modifier : ${err.message}`, 9000);
      } finally {
        busy = false;
        fs.rmSync(work, { recursive: true, force: true });
      }
    }

    // Revient à la copie gardée avant la dernière modification ou mise à jour.
    async function undo() {
      const backup = path.join(app.getPath('userData'), 'version-precedente');
      if (!fs.existsSync(path.join(backup, 'package.json'))) { say('Je n\'ai pas de version précédente sous la main.', 5000); return; }
      const win = BrowserWindow.getAllWindows()[0];
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Claude Pet demande ton accord',
        message: 'Je reviens à ma version d\'avant ma dernière modification ?',
        buttons: ['Oui, revenir en arrière', 'Non'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) return;
      update.copyTree(backup, update.ROOT);
      const edits = pet.settings.get('localEdits', []);
      pet.settings.set('localEdits', edits.slice(0, -1));
      say('Retour en arrière, je redémarre !', 3000);
      setTimeout(() => { app.relaunch(); app.exit(0); }, 1500);
    }

    pet.selfEdit = { start, undo };

    pet.bus.once('ready', () => {
      const just = pet.settings.get('justEdited', null);
      if (!just) return;
      pet.settings.set('justEdited', null);
      setTimeout(() => { pet.play('hop'); say(`Me revoilà, modifié : ${just}`, 9000); }, 3000);
    });

    pet.addMenuItems(() => [{
      label: 'Annuler ma dernière modification...',
      enabled: fs.existsSync(path.join(app.getPath('userData'), 'version-precedente', 'package.json')),
      click: undo,
    }]);
  },
};
