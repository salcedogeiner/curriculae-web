// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Tests for the Electron main process: plain Node, no DOM, no Angular. */
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    include: ['electron/**/*.test.mjs'],
    environment: 'node',
  },
});
