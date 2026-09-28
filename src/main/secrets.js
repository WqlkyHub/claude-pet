// Clé API Anthropic, gardée chiffrée sur l'ordinateur.
// Sous Windows, safeStorage utilise le chiffrement du compte Windows (DPAPI) :
// le fichier de réglages ne contient jamais la clé en clair et seul ton
// compte Windows peut la relire.
const { safeStorage } = require('electron');
const settings = require('./settings');

const KEY = 'anthropicApiKey';

function getApiKey() {
  const saved = settings.get(KEY);
  if (saved && saved.encrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(saved.encrypted, 'base64'));
    } catch (err) {
      console.error('Impossible de déchiffrer la clé API :', err);
      return null;
    }
  }
  // Repli pour les développeurs : variable d'environnement.
  return process.env.ANTHROPIC_API_KEY || null;
}

function setApiKey(apiKey) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Le chiffrement n\'est pas disponible sur cet ordinateur : la clé n\'a pas été enregistrée.');
  }
  const encrypted = safeStorage.encryptString(apiKey).toString('base64');
  settings.set(KEY, { encrypted });
}

function forgetApiKey() {
  settings.set(KEY, undefined);
}

function hasApiKey() {
  return Boolean(getApiKey());
}

module.exports = { getApiKey, setApiKey, forgetApiKey, hasApiKey };
