// @ts-check
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  session,
  shell,
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ORIGIN, APP_SCHEME, createAppHandler } from './app-protocol.mjs';
import { readConfig, writeConfig } from './config.mjs';
import { EngineRegistry } from './engines/index.mjs';
import {
  describeWorkspace,
  ensureWorkspace,
  listGenerations,
  readGeneration,
  resolveExportPath,
  resolveGenerationDir,
  saveCv,
  saveExport,
  saveGeneration,
} from './workspace.mjs';

/**
 * Curriculae desktop shell.
 *
 * The renderer is the same Angular app as `ng serve`, sandboxed and isolated,
 * talking to this process only through the narrow API in preload.cjs (typed in
 * src/app/core/desktop/desktop-api.ts). This process does what a page cannot:
 * probe and call every local engine without CORS, run the CLI agents, and keep
 * the user's workspace folder on disk. Nothing here opens a network connection
 * except to the engines the user runs; there is no telemetry and no updater.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(here, '..', 'dist', 'curriculae-web', 'browser');
const DEV_URL = process.env['CURRICULAE_DEV_URL'] ?? null;
const PRELOAD = path.join(here, 'preload.cjs');
// Window and taskbar icon on Linux and Windows (macOS takes it from the bundle).
// public/ is copied into the build; under desktop:dev there may be no build yet.
const WINDOW_ICON = DEV_URL
  ? path.resolve(here, '..', 'public', 'icon.png')
  : path.join(DIST_DIR, 'icon.png');

app.setName('Curriculae');

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const engines = new EngineRegistry();
/** @type {Map<string, AbortController>} */
const running = new Map();
/** @type {string} */
let workspaceRoot = '';

/** The page origin IPC is accepted from: our own scheme, or the dev server. */
const trustedOrigin = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN;

/**
 * @param {Electron.IpcMainInvokeEvent | Electron.IpcMainEvent} event
 */
function assertTrusted(event) {
  const url = event.senderFrame?.url ?? '';
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {
    /* not a URL: rejected below */
  }
  // `app://` URLs report the origin as "null" in Node's URL; compare by prefix.
  if (origin !== trustedOrigin && !url.startsWith(`${trustedOrigin}/`)) {
    throw new Error('Origen no autorizado');
  }
}

/**
 * @param {string} channel
 * @param {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown} handler
 */
function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrusted(event);
    return handler(event, ...args);
  });
}

/** @param {unknown} value */
function toBytes(value) {
  if (!(value instanceof Uint8Array)) {
    throw new Error('Contenido no válido');
  }
  return value;
}

function registerIpc() {
  handle('llm:detect', () => engines.detect());

  handle('llm:complete', async (event, requestId, request) => {
    if (typeof requestId !== 'string' || running.has(requestId)) {
      throw new Error('[engine-failed] Identificador de petición no válido');
    }
    const controller = new AbortController();
    running.set(requestId, controller);
    try {
      return await engines.complete(request, {
        signal: controller.signal,
        onChunk: (chunk) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('llm:chunk', requestId, chunk);
          }
        },
      });
    } finally {
      running.delete(requestId);
    }
  });

  ipcMain.on('llm:abort', (event, requestId) => {
    try {
      assertTrusted(event);
    } catch {
      return;
    }
    running.get(String(requestId))?.abort();
  });

  handle('workspace:info', () => ensureWorkspace(workspaceRoot));

  handle('workspace:choose-root', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = /** @type {Electron.OpenDialogOptions} */ ({
      title: 'Carpeta de trabajo de Curriculae',
      defaultPath: workspaceRoot,
      properties: ['openDirectory', 'createDirectory'],
    });
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    workspaceRoot = result.filePaths[0];
    await writeConfig(app.getPath('userData'), { workspaceRoot });
    return ensureWorkspace(workspaceRoot);
  });

  handle('workspace:open', async (_event, target) => {
    const info = await ensureWorkspace(workspaceRoot);
    const dir =
      target?.kind === 'generation'
        ? resolveGenerationDir(workspaceRoot, target.id)
        : target?.kind === 'cvs'
          ? info.cvDir
          : target?.kind === 'offers'
            ? info.offersDir
            : info.root;
    const error = await shell.openPath(dir);
    if (error) {
      throw new Error(error);
    }
  });

  handle('workspace:save-cv', (_event, fileName, bytes) =>
    saveCv(workspaceRoot, String(fileName), toBytes(bytes)),
  );
  handle('workspace:save-generation', (_event, input) => saveGeneration(workspaceRoot, input));
  handle('workspace:list', () => listGenerations(workspaceRoot));
  handle('workspace:read', (_event, id) => readGeneration(workspaceRoot, id));
  handle('workspace:save-export', (_event, id, fileName, bytes) =>
    saveExport(workspaceRoot, id, String(fileName), toBytes(bytes)),
  );
  handle('workspace:export-pdf', async (_event, id, fileName, html) => {
    if (typeof html !== 'string') {
      throw new Error('Contenido no válido');
    }
    const target = resolveExportPath(workspaceRoot, id, String(fileName));
    const pdf = await renderPdf(html);
    return saveExport(workspaceRoot, id, path.basename(target), pdf);
  });
}

/**
 * Renders the CV document to an A4 PDF in a hidden window with JavaScript
 * disabled: the HTML is escaped by the renderer, and even a miss could not run.
 *
 * @param {string} html
 */
async function renderPdf(html) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const buffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      preferCSSPageSize: true,
      printBackground: false,
    });
    return new Uint8Array(buffer);
  } finally {
    win.destroy();
  }
}

function hardenSessions() {
  // Nothing in the app needs the camera, notifications or geolocation. The
  // clipboard write is the "Copiar texto" button.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write'),
  );

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith(`${trustedOrigin}/`) && url !== trustedOrigin) {
        event.preventDefault();
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    title: 'Curriculae',
    icon: WINDOW_ICON,
    show: false,
    autoHideMenuBar: true,
    // Matches --color-bg so the first frame does not flash the wrong theme.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14181f' : '#f6f7f9',
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  await win.loadURL(DEV_URL ?? `${APP_ORIGIN}/`);
  return win;
}

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) {
      win.restore();
    }
    win.focus();
  }
});

app.on('window-all-closed', () => {
  for (const controller of running.values()) {
    controller.abort();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.whenReady().then(async () => {
  const config = await readConfig(app.getPath('userData'));
  workspaceRoot =
    config.workspaceRoot ??
    describeWorkspace(path.join(app.getPath('documents'), 'Curriculae')).root;
  await ensureWorkspace(workspaceRoot);

  if (!DEV_URL) {
    protocol.handle(APP_SCHEME, await createAppHandler(DIST_DIR));
  }
  hardenSessions();
  registerIpc();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});
