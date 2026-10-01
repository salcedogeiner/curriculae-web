// @ts-check
/**
 * The only bridge between the sandboxed renderer and the main process.
 *
 * It exposes exactly `DesktopApi` (src/app/core/desktop/desktop-api.ts) as
 * `window.curriculae` — named methods over fixed channels, never a generic
 * `ipcRenderer` — so the page can ask for these operations and nothing else.
 * CommonJS because sandboxed preloads cannot be ES modules.
 */
// Not destructured in the `require` itself: under `module: preserve` (tsconfig)
// TypeScript reads that form as ESM syntax and refuses to check this file.
const electron = require('electron');
const { contextBridge, ipcRenderer } = electron;

/** @type {import('../src/app/core/desktop/desktop-api').DesktopApi} */
const api = {
  platform: process.platform,
  llm: {
    detect: () => ipcRenderer.invoke('llm:detect'),
    complete: (requestId, request) => ipcRenderer.invoke('llm:complete', requestId, request),
    abort: (requestId) => ipcRenderer.send('llm:abort', requestId),
    onChunk: (listener) => {
      /** @param {Electron.IpcRendererEvent} _event @param {string} requestId @param {any} chunk */
      const relay = (_event, requestId, chunk) => listener(requestId, chunk);
      ipcRenderer.on('llm:chunk', relay);
      return () => {
        ipcRenderer.removeListener('llm:chunk', relay);
      };
    },
  },
  workspace: {
    info: () => ipcRenderer.invoke('workspace:info'),
    chooseRoot: () => ipcRenderer.invoke('workspace:choose-root'),
    open: (target) => ipcRenderer.invoke('workspace:open', target),
    saveCv: (fileName, bytes) => ipcRenderer.invoke('workspace:save-cv', fileName, bytes),
    saveGeneration: (input) => ipcRenderer.invoke('workspace:save-generation', input),
    listGenerations: () => ipcRenderer.invoke('workspace:list'),
    readGeneration: (id) => ipcRenderer.invoke('workspace:read', id),
    saveExport: (id, fileName, bytes) =>
      ipcRenderer.invoke('workspace:save-export', id, fileName, bytes),
    exportPdf: (id, fileName, html) =>
      ipcRenderer.invoke('workspace:export-pdf', id, fileName, html),
  },
};

contextBridge.exposeInMainWorld('curriculae', api);
