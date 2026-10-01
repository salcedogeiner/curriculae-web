// @ts-check
/**
 * Starts the desktop app.
 *
 *   node electron/launch.mjs         the production build in dist/ (npm run desktop)
 *   node electron/launch.mjs --dev   ng serve + Electron on it, with live reload
 *                                    (npm run desktop:dev)
 *
 * On Linux distributions that restrict unprivileged user namespaces (Ubuntu
 * 23.10+), Chromium falls back to its setuid sandbox helper, which npm installs
 * without the root ownership it needs, and Electron aborts at start. The proper
 * fix needs root once (printed below); until then the app is started with
 * --no-sandbox, which is tolerable only because the window loads nothing but
 * the app's own bundled files.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronBinary from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const DEV_URL = 'http://localhost:4200';

/** Whether Chromium's sandbox cannot start here without root's help. */
export function needsNoSandbox(platform = process.platform) {
  if (platform !== 'linux') {
    return false;
  }
  const helper = path.join(path.dirname(String(electronBinary)), 'chrome-sandbox');
  try {
    const info = statSync(helper);
    if (info.uid === 0 && (info.mode & 0o4000) !== 0) {
      return false;
    }
  } catch {
    return false;
  }
  const read = (/** @type {string} */ file) => {
    try {
      return readFileSync(file, 'utf8').trim();
    } catch {
      return null;
    }
  };
  return (
    read('/proc/sys/kernel/apparmor_restrict_unprivileged_userns') === '1' ||
    read('/proc/sys/kernel/unprivileged_userns_clone') === '0'
  );
}

/** @param {string} url @param {number} timeoutMs */
async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) {
        return;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} no respondió en ${timeoutMs / 1000} s`);
}

async function main() {
  /** @type {import('node:child_process').ChildProcess | null} */
  let server = null;
  const env = { ...process.env };
  // If set, Electron would run as plain Node and never open a window.
  delete env['ELECTRON_RUN_AS_NODE'];

  if (dev) {
    server = spawn(
      process.execPath,
      [path.join(root, 'node_modules/@angular/cli/bin/ng.js'), 'serve'],
      {
        cwd: root,
        stdio: 'inherit',
      },
    );
    await waitFor(DEV_URL, 120_000);
    env['CURRICULAE_DEV_URL'] = DEV_URL;
  } else if (!existsSync(path.join(root, 'dist/curriculae-web/browser/index.html'))) {
    console.error('No hay build de producción. Ejecuta primero: npm run build');
    process.exit(1);
  }

  const args = ['.'];
  if (needsNoSandbox()) {
    const helper = path.join(path.dirname(String(electronBinary)), 'chrome-sandbox');
    console.warn(
      '\n[curriculae] El sandbox de Chromium no puede iniciarse en este sistema; se arranca con --no-sandbox.\n' +
        '             Para activarlo, ejecuta una vez:\n' +
        `             sudo chown root:root ${helper} && sudo chmod 4755 ${helper}\n`,
    );
    args.push('--no-sandbox');
  }

  const electron = spawn(String(electronBinary), args, { cwd: root, env, stdio: 'inherit' });
  electron.on('close', (code) => {
    server?.kill();
    process.exit(code ?? 0);
  });
  process.on('SIGINT', () => electron.kill('SIGINT'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
