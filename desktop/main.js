/*
 * Derivo — Windows desktop app (Electron main process).
 * Loads the same index.html as the web/PWA version and adds real Windows features:
 * Save/Open dialogs, one-click PDF export, .derivo file association,
 * a native menu, spell-check suggestions, "unsaved changes" prompt and auto-update.
 */
'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { /* updates are optional */ }

let win = null;
let dirty = false;
let forceClose = false;

const ROOT = path.join(__dirname, '..');

function fileFromArgs(argv) {
  return argv.slice(1).find(a => /\.(derivo|mathnote)$/i.test(a) && fs.existsSync(a)) || null;
}
function readDoc(p) {
  return { path: p, name: path.basename(p), text: fs.readFileSync(p, 'utf8') };
}
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/* Only one window: double-clicking another Derivo document opens it in the running app */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const f = fileFromArgs(argv);
    if (f) send('open-file', readDoc(f));
  });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => app.quit());

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 820,
    minHeight: 520,
    title: 'Derivo',
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    backgroundColor: '#e6e8eb',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });
  win.loadFile(path.join(ROOT, 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });

  // A Derivo document the app was started with (double-click in Explorer)
  win.webContents.on('did-finish-load', () => {
    const f = fileFromArgs(process.argv);
    if (f) send('open-file', readDoc(f));
  });

  // Links open in the normal web browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // Right-click menu with spelling suggestions
  win.webContents.on('context-menu', (e, p) => {
    const items = [];
    (p.dictionarySuggestions || []).slice(0, 5).forEach(s => items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) }));
    if (p.misspelledWord) {
      items.push({ label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      items.push({ type: 'separator' });
    }
    items.push(
      { role: 'cut', enabled: p.editFlags.canCut },
      { role: 'copy', enabled: p.editFlags.canCopy },
      { role: 'paste', enabled: p.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' }
    );
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  // Ask before closing with unsaved changes
  win.on('close', e => {
    if (forceClose || !dirty) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Derivo',
      message: 'Do you want to save your changes?',
      detail: 'Your notes are also auto-saved inside Derivo, but saving creates a .derivo file you can keep and share.'
    });
    if (r === 0) send('menu', 'save-and-close');
    else if (r === 1) { forceClose = true; win.close(); }
  });
  win.on('closed', () => { win = null; });

  buildMenu();

  if (autoUpdater && app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
}

/* ---------- menu ---------- */
function buildMenu() {
  // Shortcuts are handled inside the page, so the menu only displays them (registerAccelerator: false)
  const a = (label, action, accel) => ({ label, accelerator: accel, registerAccelerator: false, click: () => send('menu', action) });
  const template = [
    { label: '&File', submenu: [
      a('&New', 'new', 'Ctrl+Alt+N'),
      a('&Open…', 'open', 'Ctrl+O'),
      { type: 'separator' },
      a('&Save', 'save', 'Ctrl+S'),
      a('Save &As…', 'saveas', 'Ctrl+Shift+S'),
      { type: 'separator' },
      a('&Export PDF…', 'pdf', 'Ctrl+P'),
      { type: 'separator' },
      { label: 'E&xit', click: () => { if (win) win.close(); } }
    ]},
    { label: '&Edit', submenu: [
      a('&Undo', 'undo', 'Ctrl+Z'),
      a('&Redo', 'redo', 'Ctrl+Y'),
      { type: 'separator' },
      { role: 'cut', registerAccelerator: false },
      { role: 'copy', registerAccelerator: false },
      { role: 'paste', registerAccelerator: false },
      { role: 'selectAll', registerAccelerator: false }
    ]},
    { label: '&Insert', submenu: [
      a('&Math in line', 'math', 'Ctrl+M'),
      a('&Equation on its own line', 'display', 'Ctrl+Shift+M'),
      { type: 'separator' },
      a('Show/hide &Symbols panel', 'palette')
    ]},
    { label: '&View', submenu: [
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ].concat(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }]) },
    { label: '&Help', submenu: [
      a('&Keyboard shortcuts', 'help', 'F1'),
      { label: 'Check for &updates', click: checkUpdatesManually },
      { type: 'separator' },
      { label: '&About Derivo', click: () => dialog.showMessageBox(win, {
        type: 'info', title: 'About Derivo',
        message: 'Derivo ' + app.getVersion(),
        detail: 'A word processor for math notes.\n© ' + new Date().getFullYear() + ' Nick Kontek'
      }) }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function checkUpdatesManually() {
  if (!autoUpdater || !app.isPackaged) {
    dialog.showMessageBox(win, { type: 'info', message: 'Updates are checked automatically in the installed app.' });
    return;
  }
  autoUpdater.checkForUpdates().then(r => {
    const latest = r && r.updateInfo && r.updateInfo.version;
    if (!latest || latest === app.getVersion()) dialog.showMessageBox(win, { type: 'info', message: 'You have the latest version (' + app.getVersion() + ').' });
    else dialog.showMessageBox(win, { type: 'info', message: 'Version ' + latest + ' is downloading. It will install when you close Derivo.' });
  }).catch(() => dialog.showMessageBox(win, { type: 'warning', message: 'Could not check for updates. Are you online?' }));
}

/* ---------- requests from the page ---------- */
ipcMain.handle('save', async (e, o) => {
  let p = o.filePath;
  if (!p || o.asNew) {
    const r = await dialog.showSaveDialog(win, {
      title: 'Save notes',
      defaultPath: p || path.join(app.getPath('documents'), (o.suggestedName || 'notes') + '.derivo'),
      filters: [{ name: 'Derivo document', extensions: ['derivo'] }]
    });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  await fs.promises.writeFile(p, o.json, 'utf8');
  app.addRecentDocument(p);
  return { path: p, name: path.basename(p) };
});

ipcMain.handle('open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open notes',
    properties: ['openFile'],
    filters: [{ name: 'Derivo document', extensions: ['derivo', 'mathnote', 'json'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  app.addRecentDocument(r.filePaths[0]);
  return readDoc(r.filePaths[0]);
});

ipcMain.handle('pdf', async (e, o) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Export PDF',
    defaultPath: path.join(app.getPath('documents'), (o.suggestedName || 'notes') + '.pdf'),
    filters: [{ name: 'PDF document', extensions: ['pdf'] }]
  });
  if (r.canceled || !r.filePath) return null;
  const data = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'Letter' });
  await fs.promises.writeFile(r.filePath, data);
  return { path: r.filePath, name: path.basename(r.filePath) };
});

ipcMain.handle('show-in-folder', (e, p) => { if (p) shell.showItemInFolder(p); });
ipcMain.handle('version', () => app.getVersion());
ipcMain.on('dirty', (e, v) => { dirty = !!v; });
ipcMain.on('close-now', () => { forceClose = true; if (win) win.close(); });
