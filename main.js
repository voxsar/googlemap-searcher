// Load .env file without external dependency
const fs   = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key   = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const { app, BrowserWindow, ipcMain, session } = require('electron');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0d0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
  });

  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          " script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com;" +
          " style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
          " font-src 'self' https://fonts.gstatic.com;" +
          " img-src 'self' data: https://maps.googleapis.com https://maps.gstatic.com https://*.ggpht.com https://*.googleapis.com;" +
          " connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com;" +
          " frame-src 'none';" +
          " object-src 'none';"
        ],
      },
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

let Store;
let store;

async function getStore() {
  if (!store) {
    Store = (await import('electron-store')).default;
    store = new Store({
      defaults: {
        theme: 'dark',
        addressSourceUrl: '',
        serviceDatabaseUrl: '',
        randomPopulateUrl: '',
      },
    });
  }
  return store;
}

let nodeFetch;
async function fetchUrl(url) {
  if (!nodeFetch) {
    nodeFetch = (await import('node-fetch')).default;
  }
  const response = await nodeFetch(url, { timeout: 15000 });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

ipcMain.handle('fetch-url', async (_event, url) => {
  try {
    if (!url || typeof url !== 'string') throw new Error('Invalid URL');
    // Basic URL validation
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http and https protocols are allowed');
    }
    const data = await fetchUrl(url);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-settings', async () => {
  const s = await getStore();
  return {
    theme: s.get('theme'),
    addressSourceUrl: s.get('addressSourceUrl'),
    serviceDatabaseUrl: s.get('serviceDatabaseUrl'),
    randomPopulateUrl: s.get('randomPopulateUrl'),
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  };
});

ipcMain.handle('save-settings', async (_event, data) => {
  const s = await getStore();
  if (data.theme !== undefined) s.set('theme', data.theme);
  if (data.addressSourceUrl !== undefined) s.set('addressSourceUrl', data.addressSourceUrl);
  if (data.serviceDatabaseUrl !== undefined) s.set('serviceDatabaseUrl', data.serviceDatabaseUrl);
  if (data.randomPopulateUrl !== undefined) s.set('randomPopulateUrl', data.randomPopulateUrl);
  return { success: true };
});

// Window controls
ipcMain.handle('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window-close', () => mainWindow && mainWindow.close());

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
