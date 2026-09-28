// Pont sécurisé entre la page du compagnon et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet:ignore-mouse', ignore),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  showContextMenu: () => ipcRenderer.send('pet:context-menu'),
  // Événement du compagnon vers les modules (ex. « clicked », « petted »).
  emit: (event, payload) => ipcRenderer.send('pet:event', { event, payload }),
  // Commandes des modules vers le compagnon (say, mood, play, sleep, wake).
  onCommand: (cb) => ipcRenderer.on('pet:command', (_e, cmd) => cb(cmd)),
  onCursor: (cb) => ipcRenderer.on('pet:cursor', (_e, pos) => cb(pos)),
  setHeight: (height) => ipcRenderer.send('pet:set-height', height),
  focus: () => ipcRenderer.send('pet:focus'),
  // Discussion avec Claude (module chat)
  chatState: () => ipcRenderer.invoke('chat:state'),
  saveKey: (key) => ipcRenderer.invoke('chat:save-key', key),
  ask: (id, text, oral = false) => ipcRenderer.send('chat:ask', { id, text, oral }),
  cancelAsk: () => ipcRenderer.send('chat:cancel'),
  chatHistory: () => ipcRenderer.invoke('chat:history'),
  // Micro et voix (module voix)
  voiceReady: () => ipcRenderer.invoke('voice:ready'),
  transcribe: (wav) => ipcRenderer.invoke('voice:transcribe', wav),
  speak: (text) => ipcRenderer.invoke('voice:speak', text),
  wakeCheck: (wav) => ipcRenderer.invoke('voice:wake-check', wav),
});
