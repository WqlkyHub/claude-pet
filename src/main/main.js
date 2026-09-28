// Processus principal : crée la fenêtre transparente du compagnon, gère le
// déplacement, le menu, l'icône de la barre des tâches et charge les modules.
const path = require('path');
const { EventEmitter } = require('events');
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require('electron');
const settings = require('./settings');
const modules = require('./modules');
const tools = require('./tools');

const WIN_WIDTH = 320; // large pour laisser de la place aux ailes du dragon céleste
const WIN_HEIGHT = 300;
const MAX_HEIGHT = 620; // la fenêtre grandit vers le haut pour les longues réponses

let win = null;
let winHeight = WIN_HEIGHT;
let tray = null;
let cursorTimer = null;
let dragTimer = null;
let topTimer = null;
const bus = new EventEmitter(); // événements venant du compagnon (clics, etc.) vers les modules

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------------------------------------------------------------------------
// Fenêtre
// ---------------------------------------------------------------------------

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - WIN_WIDTH - 40,
    y: workArea.y + workArea.height - WIN_HEIGHT,
  };
}

// Garde la position enregistrée seulement si elle est encore visible sur un écran.
function initialPosition() {
  const saved = settings.get('position');
  if (saved) {
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      saved.x + WIN_WIDTH / 2 >= a.x && saved.x + WIN_WIDTH / 2 <= a.x + a.width &&
      saved.y + WIN_HEIGHT / 2 >= a.y && saved.y + WIN_HEIGHT / 2 <= a.y + a.height);
    if (visible) return saved;
  }
  return defaultPosition();
}

function createWindow() {
  const { x, y } = initialPosition();
  win = new BrowserWindow({
    x, y,
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: settings.get('alwaysOnTop', true),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (settings.get('alwaysOnTop', true)) win.setAlwaysOnTop(true, 'screen-saver');
  // Windows retire parfois le « premier plan » (jeu en plein écran, barre des tâches,
  // autre appli épinglée) : on le réaffirme régulièrement. Il ne se cache que si tu le demandes.
  topTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible() || !settings.get('alwaysOnTop', true)) return;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  }, 3000);
  // Les zones transparentes laissent passer les clics vers le bureau ;
  // le rendu réactive la souris quand le curseur survole la créature.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.showInactive();
    bus.emit('ready');
  });
  win.on('closed', () => { win = null; });

  startCursorTracking();
}

// Envoie la position du curseur (relative à la fenêtre) pour que les yeux la suivent.
function startCursorTracking() {
  let last = '';
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const key = `${p.x - b.x},${p.y - b.y}`;
    if (key === last) return;
    last = key;
    win.webContents.send('pet:cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 50);
}

// ---------------------------------------------------------------------------
// Commandes envoyées au compagnon (utilisées par les modules)
// ---------------------------------------------------------------------------

function sendCommand(cmd) {
  if (win && !win.isDestroyed()) win.webContents.send('pet:command', cmd);
}

const extraMenuItems = []; // fonctions des modules qui ajoutent des lignes au menu

const petContext = {
  bus,
  settings,
  tools,
  getWindow: () => win,
  send: sendCommand,
  addMenuItems: (fn) => extraMenuItems.push(fn),
  say: (text, opts = {}) => sendCommand({ type: 'say', text, ...opts }),
  setMood: (mood, opts = {}) => sendCommand({ type: 'mood', mood, ...opts }),
  play: (animation) => sendCommand({ type: 'play', animation }),
  sleep: () => sendCommand({ type: 'sleep' }),
  wake: () => sendCommand({ type: 'wake' }),
};

// ---------------------------------------------------------------------------
// IPC depuis le rendu
// ---------------------------------------------------------------------------

ipcMain.on('pet:ignore-mouse', (_e, ignore) => {
  if (!win) return;
  win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

// Le déplacement est calculé ici à partir du curseur écran : c'est fiable même
// quand la souris sort de la fenêtre pendant un geste rapide.
ipcMain.on('pet:drag-start', () => {
  if (!win) return;
  const start = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!win) return;
    const p = screen.getCursorScreenPoint();
    // setBounds plutôt que setPosition : évite que la fenêtre grossisse
    // petit à petit sous Windows avec une mise à l'échelle différente de 100 %.
    win.setBounds({ x: wx + p.x - start.x, y: wy + p.y - start.y, width: WIN_WIDTH, height: winHeight });
  }, 10);
  bus.emit('drag-start');
});

ipcMain.on('pet:drag-end', () => {
  clearInterval(dragTimer);
  dragTimer = null;
  if (!win) return;
  const [x, wy] = win.getPosition();
  const y = wy + winHeight - WIN_HEIGHT; // position enregistrée à taille normale
  settings.set('position', { x, y });
  bus.emit('drag-end', { x, y });
});

// Agrandit la fenêtre vers le haut (le compagnon reste en place) pour une longue bulle.
ipcMain.on('pet:set-height', (_e, height) => {
  if (!win) return;
  const b = win.getBounds();
  const { workArea } = screen.getDisplayMatching(b);
  const bottom = b.y + b.height;
  const h = Math.round(Math.max(WIN_HEIGHT, Math.min(Number(height) || WIN_HEIGHT, MAX_HEIGHT, bottom - workArea.y)));
  if (h === winHeight) return;
  winHeight = h;
  win.setBounds({ x: b.x, y: bottom - h, width: WIN_WIDTH, height: h });
});

// Donne le clavier au compagnon quand on lui parle.
ipcMain.on('pet:focus', () => {
  if (win) win.focus();
});

ipcMain.on('pet:event', (_e, { event, payload }) => {
  bus.emit(event, payload);
});

ipcMain.on('pet:context-menu', () => {
  if (!win) return;
  bus.emit('context-menu');
  buildMenu().popup({ window: win });
});

// ---------------------------------------------------------------------------
// Menu (clic droit sur le compagnon et icône près de l'horloge)
// ---------------------------------------------------------------------------

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide(); else win.showInactive();
}

function buildMenu() {
  const onTop = settings.get('alwaysOnTop', true);
  const atLogin = app.getLoginItemSettings(loginItem()).openAtLogin;
  const fromModules = extraMenuItems.flatMap((fn) => {
    try { return fn(); } catch (err) { console.error(err); return []; }
  });
  return Menu.buildFromTemplate([
    ...fromModules,
    { type: 'separator' },
    { label: 'Faire une sieste', click: () => petContext.sleep() },
    { label: 'Réveiller', click: () => petContext.wake() },
    { type: 'separator' },
    {
      label: 'Toujours au premier plan',
      type: 'checkbox',
      checked: onTop,
      click: (item) => {
        settings.set('alwaysOnTop', item.checked);
        if (win) win.setAlwaysOnTop(item.checked, 'screen-saver');
      },
    },
    {
      label: 'Lancer au démarrage de Windows',
      type: 'checkbox',
      checked: atLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, ...loginItem() }),
    },
    {
      label: 'Remettre dans le coin',
      click: () => {
        if (!win) return;
        const { x, y } = defaultPosition();
        win.setBounds({ x, y: y - (winHeight - WIN_HEIGHT), width: WIN_WIDTH, height: winHeight });
        settings.set('position', { x, y });
      },
    },
    { label: win && win.isVisible() ? 'Cacher' : 'Afficher', click: toggleVisible },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]);
}

// Lancement au démarrage de Windows. Sans installeur, c'est electron.exe qui
// démarre : il faut lui donner le dossier du compagnon, sinon il ouvrirait
// l'écran d'accueil d'Electron.
function loginItem() {
  return app.isPackaged ? {} : { path: process.execPath, args: [path.resolve(app.getAppPath())] };
}

// Tu as demandé qu'il démarre tout seul avec l'ordi : activé une fois, au premier
// lancement. Tu peux le décocher ensuite (clic droit), ton choix est respecté.
function enableAutostartOnce() {
  if (process.platform !== 'win32' || settings.get('autostartDone')) return;
  app.setLoginItemSettings({ openAtLogin: true, ...loginItem() });
  settings.set('autostartDone', true);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Claude Pet');
  tray.on('click', toggleVisible);
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

app.on('second-instance', () => {
  if (win) {
    win.showInactive();
    petContext.play('hop');
  }
});

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.claudepet.app');
  createWindow();
  createTray();
  enableAutostartOnce();
  modules.load(petContext);
});

app.on('before-quit', () => {
  clearInterval(cursorTimer);
  clearInterval(dragTimer);
  clearInterval(topTimer);
  modules.unload();
});

app.on('window-all-closed', () => app.quit());
