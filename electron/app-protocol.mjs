// @ts-check
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Serves the Angular build from `app://curriculae/` instead of `file://`.
 *
 * `file://` breaks the app's `<base href="/">` and lazy chunks, and gives the
 * page the whole filesystem as its origin. A custom standard scheme gives it a
 * real, isolated origin, SPA fallback to `index.html`, and a strict Content
 * Security Policy sent as a header.
 */

export const APP_SCHEME = 'app';
export const APP_HOST = 'curriculae';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** @type {Readonly<Record<string, string>>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Maps a request URL to a file inside `distDir`, or `null` when it would
 * escape it.
 *
 * @param {string} distDir
 * @param {string} requestUrl
 */
export function resolveAppPath(distDir, requestUrl) {
  const url = new URL(requestUrl);
  if (url.host !== APP_HOST) {
    return null;
  }
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const full = path.resolve(distDir, relative || 'index.html');
  const root = path.resolve(distDir);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

/**
 * The production build ends `index.html` with one small inline script (the
 * critical-CSS loader). Hashing it at startup keeps the CSP free of
 * `'unsafe-inline'` without changing the Angular build.
 *
 * @param {string} html
 */
export function inlineScriptHashes(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`,
  );
}

/**
 * `style-src 'unsafe-inline'` is required by Angular's emulated component
 * styles, which are injected as <style> elements. `connect-src 'self'`: in the
 * desktop app every model call goes through the main process, so the page
 * itself never needs to reach a network origin.
 *
 * @param {readonly string[]} scriptHashes
 */
export function contentSecurityPolicy(scriptHashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The `protocol.handle` callback for a given build directory.
 *
 * @param {string} distDir
 * @returns {Promise<(request: Request) => Promise<Response>>}
 */
export async function createAppHandler(distDir) {
  const indexPath = path.join(distDir, 'index.html');
  const indexHtml = await readFile(indexPath, 'utf8');
  const csp = contentSecurityPolicy(inlineScriptHashes(indexHtml));

  return async (request) => {
    const target = resolveAppPath(distDir, request.url);
    if (target === null) {
      return new Response('Not found', { status: 404 });
    }

    let file = target;
    try {
      if (!(await stat(file)).isFile()) {
        file = indexPath;
      }
    } catch {
      // A client-side route or a missing asset. Routes get the app shell;
      // anything that looks like a file is a genuine 404.
      if (path.extname(target) !== '') {
        return new Response('Not found', { status: 404 });
      }
      file = indexPath;
    }

    const body = await readFile(file);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Security-Policy': csp,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
}
