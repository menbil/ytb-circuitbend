const { app, BrowserWindow, session, shell, desktopCapturer } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;

const BACKEND_PORT = process.env.PORT || 3001;
const IS_DEV = process.env.NODE_ENV === 'development';
const STUDIO_URL = IS_DEV ? 'http://localhost:5173' : `http://localhost:${BACKEND_PORT}`;

// Enable hardware WebGL acceleration, WebMIDI and zero-gesture autoplay
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'WebMidi,SharedArrayBuffer');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

function startLocalBackendServer() {
  if (IS_DEV) {
    // In dev mode, concurrently already starts server & vite client
    return;
  }

  const serverEntry = path.resolve(__dirname, '../server/dist/index.js');
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      ELECTRON_RUN_AS_NODE: '1'
    },
    stdio: 'inherit',
    windowsHide: true
  });

  serverProcess.on('error', (err) => {
    console.error('[Electron Backend Error]:', err);
  });
}

function configureNativePermissions() {
  const ses = session.defaultSession;

  // Automatically grant WebMIDI, Webcam, Microphone, and Screen/Audio Loopback permissions
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = [
      'midi',
      'midiSysex',
      'media',
      'display-capture',
      'audioCapture',
      'videoCapture',
      'fullscreen'
    ];
    callback(allowed.includes(permission));
  });

  ses.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = [
      'midi',
      'midiSysex',
      'media',
      'display-capture',
      'audioCapture',
      'videoCapture',
      'fullscreen'
    ];
    return allowed.includes(permission);
  });

  // Enable system audio loopback when capturing screen in Electron
  ses.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      if (sources && sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback({});
      }
    });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: '⚡ CIRCUIT//BEND — DESKTOP LOCAL STUDIO',
    backgroundColor: '#050507',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false // Keep 60Hz LFO & Audio/Video shaders running even when unfocused
    }
  });

  // Handle Dual-Screen VJ Output Window (?vj=1)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('vj=1')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 720,
          title: '🖥️ CIRCUIT//BEND — VJ CRT OUTPUT (Double-clic = Plein écran)',
          backgroundColor: '#000000',
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
          }
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const loadWithRetry = (retries = 15) => {
    mainWindow.loadURL(STUDIO_URL).catch(() => {
      if (retries > 0) {
        setTimeout(() => loadWithRetry(retries - 1), 600);
      }
    });
  };

  loadWithRetry();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  configureNativePermissions();
  startLocalBackendServer();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
    } catch {}
    serverProcess = null;
  }
  app.quit();
});

