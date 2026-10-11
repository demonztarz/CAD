const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { loadDwg } = require('./dwgload.js');

let win;
let forceClose = false;

const DRAWING_FILTERS = [
  { name: 'All Drawings (*.dwg, *.dxf, *.dfg)', extensions: ['dwg', 'dxf', 'dfg'] },
  { name: 'DWG Drawing (*.dwg)', extensions: ['dwg'] },
  { name: 'DXF Drawing (*.dxf)', extensions: ['dxf'] },
  { name: 'DraftForge Drawing (*.dfg)', extensions: ['dfg'] },
];

function send(cmd) {
  if (win) win.webContents.send('menu', cmd);
}

// Keyboard shortcuts are handled by the drawing UI; the native menu only offers mouse access.
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', click: () => send('NEW') },
        { label: 'Open…', click: () => send('OPEN') },
        { type: 'separator' },
        { label: 'Save', click: () => send('SAVE') },
        { label: 'Save As…', click: () => send('SAVEAS') },
        { type: 'separator' },
        { label: 'Export DXF…', click: () => send('DXFOUT') },
        { label: 'Export SVG…', click: () => send('SVGOUT') },
        { label: 'Export PNG…', click: () => send('PNGOUT') },
        { type: 'separator' },
        { label: isMac ? 'Close Window' : 'Exit', click: () => send('APP_CLOSE') },
      ],
    },
    {
      label: 'Edit',
      submenu: isMac
        ? [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]
        : [{ label: 'Undo', click: () => send('UNDO') }, { label: 'Redo', click: () => send('REDO') }, { type: 'separator' }, { label: 'Select All', click: () => send('SELECTALL') }],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom Extents', click: () => send('ZOOM E') },
        { label: 'Toggle Grid', click: () => send('GRID') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { label: 'Help', submenu: [{ label: 'Command Reference', click: () => send('HELP') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function readDrawing(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.dwg') {
      const { doc, stats } = await loadDwg(fs.readFileSync(filePath));
      return { path: filePath, kind: 'dwg', doc, stats };
    }
    return { path: filePath, kind: ext === '.dxf' ? 'dxf' : 'dfg', text: fs.readFileSync(filePath, 'utf8') };
  } catch (err) {
    return { path: filePath, error: String((err && err.message) || err) };
  }
}

function createWindow(fileToOpen) {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#1b1f25',
    title: 'DraftForge',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.on('did-finish-load', async () => {
    if (fileToOpen) win.webContents.send('file-opened', await readDrawing(fileToOpen));
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    win.webContents.send('menu', 'APP_CLOSE');
  });
}

ipcMain.handle('open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: DRAWING_FILTERS });
  if (r.canceled || !r.filePaths.length) return null;
  return readDrawing(r.filePaths[0]);
});

ipcMain.handle('open-path', async (_e, p) => readDrawing(p));

ipcMain.handle('save-dialog', async (_e, { defaultName, filters }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('write-file', async (_e, { path: p, data, encoding }) => {
  if (encoding === 'base64') fs.writeFileSync(p, Buffer.from(data, 'base64'));
  else fs.writeFileSync(p, data, 'utf8');
  return true;
});

// Plot a sheet (SVG in millimetres) to a vector PDF or to a printer at its exact paper size.
ipcMain.handle('plot', async (_e, { svg, widthMm, heightMm, action, path: out }) => {
  const w = +widthMm, h = +heightMm;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${w}mm ${h}mm;margin:0}html,body{margin:0;padding:0;background:#fff}svg{display:block;width:${w}mm;height:${h}mm}</style></head><body>${svg}</body></html>`;
  const tmp = path.join(app.getPath('temp'), `draftforge-plot-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await pw.loadFile(tmp);
    if (action === 'pdf') {
      const data = await pw.webContents.printToPDF({
        pageSize: { width: w / 25.4, height: h / 25.4 },
        margins: { marginType: 'none' },
        printBackground: true,
        preferCSSPageSize: true,
      });
      fs.writeFileSync(out, data);
      return { ok: true, path: out };
    }
    return await new Promise((resolve) => {
      pw.webContents.print(
        { silent: false, printBackground: true, margins: { marginType: 'none' }, pageSize: { width: Math.round(w * 1000), height: Math.round(h * 1000) } },
        (ok, error) => resolve({ ok, error: ok ? undefined : error }),
      );
    });
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    pw.destroy();
    fs.rmSync(tmp, { force: true });
  }
});

ipcMain.handle('app-version', () => app.getVersion());

ipcMain.handle('confirm-discard', async () => {
  const r = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'DraftForge',
    message: 'Save changes to the current drawing?',
  });
  return ['save', 'discard', 'cancel'][r.response];
});

ipcMain.on('set-title', (_e, title) => {
  if (win) win.setTitle(title);
});

ipcMain.on('really-close', () => {
  forceClose = true;
  if (win) win.close();
});

const fileArg = process.argv.slice(1).find((a) => /\.(dwg|dxf|dfg)$/i.test(a));

// Single instance: opening a second drawing from Explorer reuses the running window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', async (_e, argv) => {
    const f = argv.slice(1).find((a) => /\.(dwg|dxf|dfg)$/i.test(a));
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) win.webContents.send('file-opened', await readDrawing(f));
    }
  });
  app.whenReady().then(() => {
    buildMenu();
    createWindow(fileArg);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
