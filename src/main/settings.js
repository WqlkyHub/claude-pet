// Réglages persistants, stockés en JSON dans le dossier de données de l'app
// (sous Windows : %APPDATA%\claude-pet\settings.json).
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

function get(key, fallback) {
  const value = load()[key];
  return value === undefined ? fallback : value;
}

function set(key, value) {
  load()[key] = value;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('Impossible d\'enregistrer les réglages :', err);
  }
}

module.exports = { get, set };
