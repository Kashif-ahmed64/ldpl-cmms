import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import path from 'path';
import Store from 'electron-store';

type AppSettings = { serverUrl: string };

const store = new Store<AppSettings>({
  defaults: { serverUrl: 'http://localhost:3001' },
}) as Store<AppSettings> & {
  get<K extends keyof AppSettings>(key: K): AppSettings[K];
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
};

function getServerUrl(): string {
  return store.get('serverUrl');
}

function setServerUrl(url: string): string {
  const clean = url.replace(/\/$/, '');
  store.set('serverUrl', clean);
  return clean;
}

const isDev = process.argv.includes('--dev');
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'LDPL CMMS',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: !isDev,
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const clientPath = path.join(process.resourcesPath, 'client', 'index.html');
    win.loadFile(clientPath).catch(async () => {
      await dialog.showErrorBox(
        'LDPL CMMS — Startup Error',
        'Application files not found. Please reinstall LDPL CMMS.',
      );
      app.quit();
    });
  }

  // Desktop-only: block opening external browser windows from the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith('http://localhost:5173')) return;
    if (!isDev && url.startsWith('file://')) return;
    event.preventDefault();
  });
}

ipcMain.handle('get-server-url', () => getServerUrl());
ipcMain.handle('set-server-url', (_event, url: string) => setServerUrl(url));

app.whenReady().then(createWindow);

app.on('second-instance', () => {
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0) {
    const win = wins[0];
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

console.log(`LDPL CMMS Desktop — API Server: ${getServerUrl()}`);
