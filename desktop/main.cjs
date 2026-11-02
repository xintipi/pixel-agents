// Desktop shell (Electron): starts the built server (dist/server) on its own port and shows the page in a window.
// Doesn't touch server/ or client/: `npm run build` first, then `npm run desktop`.
const { app, BrowserWindow, shell } = require('electron');
const { fork } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Not the Docker port (4747), so both can run at the same time.
const PORT = Number.parseInt(process.env.HABBLAUD_DESKTOP_PORT ?? '', 10) || 4749;
const URL = `http://127.0.0.1:${PORT}/`;

let server = null;
let win = null;

function startServer() {
  // ELECTRON_RUN_AS_NODE: Electron's own binary runs the server as plain Node (no Node install needed).
  server = fork(path.join(ROOT, 'dist', 'server', 'index.js'), [], {
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', HABBLAUD_PORT: String(PORT), HABBLAUD_HOST: '127.0.0.1' },
    stdio: 'inherit',
  });
  server.once('exit', () => {
    server = null;
    if (!app.isQuitting) app.quit();
  });
}

function waitForPort(timeoutMs = 20_000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const s = net.connect(PORT, '127.0.0.1');
      s.once('connect', () => {
        s.destroy();
        resolve();
      });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - t0 > timeoutMs) reject(new Error(`server didn't come up on port ${PORT}`));
        else setTimeout(probe, 200);
      });
    };
    probe();
  });
}

async function openWindow() {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#1a1d17', title: 'FTE', autoHideMenuBar: true });
  // Links to other sites open in the real browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(URL)) void shell.openExternal(url);
    return { action: url.startsWith(URL) ? 'allow' : 'deny' };
  });
  await win.loadURL(URL);
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForPort();
    await openWindow();
  } catch (e) {
    console.error(e);
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  server?.kill();
});
app.on('window-all-closed', () => app.quit());
