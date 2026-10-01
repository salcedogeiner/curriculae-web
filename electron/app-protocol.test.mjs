// @ts-check
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  createAppHandler,
  inlineScriptHashes,
  resolveAppPath,
} from './app-protocol.mjs';

/** @type {string} */
let dist;

beforeEach(async () => {
  dist = await mkdtemp(path.join(tmpdir(), 'curriculae-dist-'));
  await writeFile(
    path.join(dist, 'index.html'),
    '<html><body><app-root></app-root><script src="main.js" type="module"></script><script>console.log(1)</script></body></html>',
  );
  await writeFile(path.join(dist, 'main.js'), 'export {}');
  await mkdir(path.join(dist, 'media'));
});

afterEach(async () => {
  await rm(dist, { recursive: true, force: true });
});

describe('app://curriculae', () => {
  it('resuelve rutas dentro del build y rechaza las que escapan', () => {
    expect(resolveAppPath(dist, 'app://curriculae/main.js')).toBe(path.join(dist, 'main.js'));
    expect(resolveAppPath(dist, 'app://curriculae/')).toBe(path.join(dist, 'index.html'));
    // The URL parser collapses dot segments at the root: still inside the build.
    expect(resolveAppPath(dist, 'app://curriculae/%2e%2e/%2e%2e/etc/passwd')).toBe(
      path.join(dist, 'etc/passwd'),
    );
    // An encoded slash only becomes a separator after decoding: must be refused.
    expect(resolveAppPath(dist, 'app://curriculae/..%2f..%2fetc%2fpasswd')).toBeNull();
    expect(resolveAppPath(dist, 'app://otro-host/main.js')).toBeNull();
  });

  it('calcula el hash solo de los scripts inline', () => {
    const hashes = inlineScriptHashes(
      '<script src="a.js"></script><script>console.log(1)</script>',
    );
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
  });

  it('la CSP no permite unsafe-inline en scripts ni conexiones de red desde la página', () => {
    const csp = contentSecurityPolicy(["'sha256-abc'"]);
    expect(csp).toContain("script-src 'self' 'sha256-abc'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it('sirve los archivos con su tipo y la CSP como cabecera', async () => {
    const handler = await createAppHandler(dist);
    const response = await handler(new Request('app://curriculae/main.js'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/javascript');
    expect(response.headers.get('Content-Security-Policy')).toContain('sha256-');
  });

  it('una ruta de la SPA recibe index.html; un archivo que falta es 404', async () => {
    const handler = await createAppHandler(dist);

    const route = await handler(new Request('app://curriculae/resultado'));
    expect(route.status).toBe(200);
    expect(await route.text()).toContain('<app-root>');

    expect((await handler(new Request('app://curriculae/falta.js'))).status).toBe(404);
  });
});
