// Range la fenêtre active dans une grande catégorie d'activité.
// On regarde d'abord le nom du logiciel, puis le titre (utile pour les
// navigateurs : YouTube, GitHub, Netflix...), puis le dossier d'installation
// (les jeux Steam, Epic, Riot...). Facile à compléter : ajoute un nom en minuscules.

const CATEGORIES = [
  {
    id: 'claude', label: 'Claude', verb: 'tu parles avec Claude',
    apps: ['claude'],
    titles: /(^|[\s-])Claude($|\s[-—|])/,
  },
  {
    id: 'code', label: 'code', verb: 'tu codes',
    apps: ['code', 'code - insiders', 'cursor', 'windsurf', 'zed', 'devenv', 'idea64', 'pycharm64',
      'webstorm64', 'rider64', 'clion64', 'goland64', 'phpstorm64', 'rustrover64', 'studio64',
      'sublime_text', 'notepad++', 'windowsterminal', 'wt', 'powershell', 'pwsh', 'cmd',
      'mintty', 'alacritty', 'wezterm-gui', 'godot', 'unity', 'unrealeditor', 'github desktop', 'fork'],
    titles: /GitHub|GitLab|Stack Overflow|localhost:\d|MDN Web Docs|npm \||Vercel|Replit|CodePen/i,
  },
  {
    id: 'musique', label: 'musique', verb: 'tu écoutes de la musique',
    apps: ['spotify', 'deezer', 'itunes', 'applemusic', 'tidal', 'foobar2000', 'musicbee', 'aimp', 'winamp'],
    titles: /YouTube Music|SoundCloud|Deezer|Spotify|Apple Music|Bandcamp/i,
  },
  {
    id: 'jeu', label: 'jeu vidéo', verb: 'tu joues',
    apps: ['steam', 'epicgameslauncher', 'riotclientservices', 'riotclientux', 'leagueclientux',
      'league of legends', 'valorant-win64-shipping', 'battle.net', 'galaxyclient', 'eadesktop',
      'ubisoftconnect', 'minecraft.windows', 'minecraftlauncher', 'robloxplayerbeta',
      'fortniteclient-win64-shipping', 'cs2', 'dota2', 'rocketleague', 'gta5', 'eldenring', 'r5apex',
      'overwatch', 'rainbowsix', 'destiny2', 'wow', 'hollow_knight', 'stardew valley', 'terraria',
      'xboxpcapp', 'playnite.desktopapp'],
    titles: /^Minecraft\b/,
    paths: /steamapps[\\/]common|[\\/]Epic Games[\\/]|[\\/]Riot Games[\\/]|[\\/]XboxGames[\\/]|[\\/]GOG Galaxy[\\/]Games|[\\/]Ubisoft Game Launcher[\\/]games/i,
  },
  {
    id: 'video', label: 'vidéo', verb: 'tu regardes une vidéo',
    apps: ['vlc', 'mpc-hc64', 'mpc-be64', 'potplayermini64', 'mpv', 'netflix', 'plex', 'stremio'],
    titles: /YouTube|Netflix|Twitch|Prime Video|Disney\+|Crunchyroll|Canal\+|Molotov|Arte\.tv/i,
  },
  {
    id: 'discussion', label: 'discussion', verb: 'tu discutes',
    apps: ['discord', 'whatsapp', 'telegram', 'slack', 'ms-teams', 'teams', 'signal', 'messenger', 'skype'],
    titles: /WhatsApp|Messenger|Discord|Instagram|Snapchat/i,
  },
  {
    id: 'travail', label: 'travail', verb: 'tu travailles',
    apps: ['winword', 'excel', 'powerpnt', 'outlook', 'onenote', 'olk', 'notion', 'obsidian', 'acrobat',
      'acrord32', 'soffice.bin', 'swriter', 'scalc', 'thunderbird', 'evernote', 'anki'],
    titles: /Google Docs|Google Sheets|Google Slides|Google Drive|Gmail|Outlook|Notion|Overleaf|Canva|Trello|Moodle|Pronote/,
  },
  {
    id: 'creation', label: 'création', verb: 'tu crées',
    apps: ['photoshop', 'illustrator', 'afterfx', 'adobe premiere pro', 'resolve', 'blender', 'figma',
      'krita', 'aseprite', 'gimp-2.10', 'gimp-3.0', 'inkscape', 'clipstudiopaint', 'fl64', 'fl',
      'ableton live 12 suite', 'audacity', 'obs64', 'capcut', 'lightroom'],
    titles: /Figma|Canva|Photopea/i,
  },
];

const BROWSERS = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'opera_gx', 'vivaldi', 'arc', 'zen', 'librewolf'];

const OTHER = { id: 'autre', label: 'autre chose', verb: 'tu es sur l\'ordi' };
const BROWSING = { id: 'web', label: 'navigation', verb: 'tu navigues' };

function byId(id) {
  return CATEGORIES.find((c) => c.id === id) || (id === 'web' ? BROWSING : OTHER);
}

function classify({ app = '', title = '', path = '' } = {}) {
  const name = String(app).toLowerCase();
  const browser = BROWSERS.includes(name);
  // Le nom du logiciel décide d'abord, sauf pour les navigateurs où c'est l'onglet qui compte.
  if (!browser) {
    const hit = CATEGORIES.find((c) => c.apps.includes(name));
    if (hit) return hit;
    const game = CATEGORIES.find((c) => c.paths && c.paths.test(path || ''));
    if (game) return game;
  }
  // YouTube Music avant YouTube : l'ordre des catégories s'en charge (musique avant vidéo).
  const byTitle = CATEGORIES.find((c) => c.titles && c.titles.test(title || ''));
  if (byTitle) return byTitle;
  return browser ? BROWSING : OTHER;
}

module.exports = { classify, byId, CATEGORIES };
