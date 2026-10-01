// @ts-check
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Desktop settings that must outlive the renderer's `localStorage`: today only
 * the workspace location. Lives in Electron's `userData` directory, versioned
 * like everything else the app persists (AGENTS.md §1.7), and a bad file is
 * ignored, never fatal.
 */

export const CONFIG_FILE = 'config.json';
export const CONFIG_VERSION = 1;

/** @typedef {{ workspaceRoot: string | null }} DesktopConfig */

/**
 * @param {string} userDataDir
 * @returns {Promise<DesktopConfig>}
 */
export async function readConfig(userDataDir) {
  try {
    const parsed = JSON.parse(await readFile(path.join(userDataDir, CONFIG_FILE), 'utf8'));
    if (parsed?.schemaVersion === CONFIG_VERSION && typeof parsed.workspaceRoot === 'string') {
      return { workspaceRoot: parsed.workspaceRoot };
    }
  } catch {
    /* first run, or a corrupt file: defaults */
  }
  return { workspaceRoot: null };
}

/**
 * @param {string} userDataDir
 * @param {DesktopConfig} config
 */
export async function writeConfig(userDataDir, config) {
  await mkdir(userDataDir, { recursive: true });
  await writeFile(
    path.join(userDataDir, CONFIG_FILE),
    `${JSON.stringify({ schemaVersion: CONFIG_VERSION, ...config }, null, 2)}\n`,
    'utf8',
  );
}
