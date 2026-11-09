/* Derivo — safe bridge between the page and the desktop app. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mathNotesDesktop', {
  save: o => ipcRenderer.invoke('save', o),
  open: () => ipcRenderer.invoke('open'),
  exportPDF: o => ipcRenderer.invoke('pdf', o),
  showInFolder: p => ipcRenderer.invoke('show-in-folder', p),
  version: () => ipcRenderer.invoke('version'),
  setDirty: v => ipcRenderer.send('dirty', !!v),
  closeNow: () => ipcRenderer.send('close-now'),
  onOpenFile: cb => ipcRenderer.on('open-file', (e, d) => cb(d)),
  onMenu: cb => ipcRenderer.on('menu', (e, a) => cb(a))
});
