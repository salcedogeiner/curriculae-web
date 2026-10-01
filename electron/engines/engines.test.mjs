// @ts-check
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findExecutable, parseClaudeLine, parseOpencodeModels } from './cli.mjs';
import { detectOllama, ollamaBaseUrl, parseOllamaTags } from './http.mjs';

/** Only Ollama, at its default URL: no real CLI is ever spawned by these tests. */
const onlyOllama = [() => detectOllama('http://127.0.0.1:11434')];
import { EngineRegistry, validateRequest } from './index.mjs';
import { EngineError, toEngineError } from './shared.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** @param {string[]} chunks */
function streamed(...chunks) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
  );
}

const TAGS = {
  models: [
    {
      name: 'qwen3.5:latest',
      capabilities: ['completion', 'thinking'],
      details: { parameter_size: '9.7B' },
    },
  ],
};

describe('Ollama (proceso principal)', () => {
  it('respeta OLLAMA_HOST en sus distintas formas', () => {
    expect(ollamaBaseUrl({})).toBe('http://127.0.0.1:11434');
    expect(ollamaBaseUrl({ OLLAMA_HOST: '0.0.0.0:11500' })).toBe('http://127.0.0.1:11500');
    expect(ollamaBaseUrl({ OLLAMA_HOST: 'http://gpu-box:11434/' })).toBe('http://gpu-box:11434');
  });

  it('detecta modelos y marca los que razonan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(TAGS)),
    );

    const engine = await detectOllama('http://127.0.0.1:11434');
    expect(engine.status).toBe('ready');
    expect(engine.models[0]).toMatchObject({
      id: 'ollama:qwen3.5:latest',
      thinking: true,
      details: '9.7B',
    });
  });

  it('un Ollama apagado es unavailable, sin lanzar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))),
    );

    await expect(detectOllama('http://127.0.0.1:11434')).resolves.toMatchObject({
      status: 'unavailable',
    });
  });

  it('parseOllamaTags tolera basura', () => {
    expect(parseOllamaTags({ models: [null, { name: 3 }] })).toEqual([]);
  });
});

describe('Claude (stream-json verificado)', () => {
  it('extrae los deltas de texto', () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hola' } },
    });
    expect(parseClaudeLine(line)).toEqual({ text: 'Hola' });
  });

  it('ignora el razonamiento y los eventos de sistema', () => {
    const thinking = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'mmm' } },
    });
    expect(parseClaudeLine(thinking)).toBeNull();
    expect(parseClaudeLine(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeNull();
    expect(parseClaudeLine('no es json')).toBeNull();
  });

  it('lee el resultado final y los errores', () => {
    expect(parseClaudeLine(JSON.stringify({ type: 'result', result: 'Hola' }))).toEqual({
      result: 'Hola',
    });
    expect(
      parseClaudeLine(JSON.stringify({ type: 'result', is_error: true, result: 'sin sesión' })),
    ).toEqual({
      error: 'sin sesión',
    });
  });
});

describe('opencode', () => {
  it('lee la lista de modelos provider/model e ignora el resto', () => {
    const output =
      'ollama/qwen3.5:latest\nopencode/big-pickle\n\nAviso: algo\nollama/qwen3.5:latest\n';
    expect(parseOpencodeModels(output)).toEqual(['ollama/qwen3.5:latest', 'opencode/big-pickle']);
  });
});

describe('findExecutable', () => {
  it('encuentra un ejecutable en las carpetas dadas y no un archivo sin permiso', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'curriculae-bin-'));
    try {
      await writeFile(path.join(dir, 'claude'), '#!/bin/sh\n');
      await writeFile(path.join(dir, 'opencode'), '');
      await chmod(path.join(dir, 'claude'), 0o755);
      await chmod(path.join(dir, 'opencode'), 0o644);

      expect(findExecutable('claude', [dir])).toBe(path.join(dir, 'claude'));
      expect(findExecutable('opencode', [dir])).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('EngineRegistry', () => {
  const ollamaOnly = vi.fn(async (/** @type {string} */ url) =>
    url.endsWith('/api/tags') ? Response.json(TAGS) : Promise.reject(new Error('down')),
  );

  const request = {
    model: { id: 'ollama:qwen3.5:latest' },
    messages: [{ role: 'user', content: 'Hola' }],
    temperature: 0.2,
  };

  it('rechaza una petición mal formada', () => {
    expect(() => validateRequest({ model: { id: 'x' }, messages: [], temperature: 0 })).toThrow(
      EngineError,
    );
    expect(() =>
      validateRequest({
        model: { id: 'x' },
        messages: [{ role: 'root', content: 'x' }],
        temperature: 0,
      }),
    ).toThrow();
  });

  it('solo ejecuta modelos que la detección encontró', async () => {
    vi.stubGlobal('fetch', ollamaOnly);
    const registry = new EngineRegistry({ detectors: onlyOllama });

    const error = await registry
      .complete(
        { ...request, model: { id: 'claude:/bin/rm' } },
        { signal: new AbortController().signal, onChunk: () => {} },
      )
      .catch((/** @type {unknown} */ e) => e);

    expect(error).toBeInstanceOf(EngineError);
    expect(String(/** @type {Error} */ (error).message)).toMatch(/^\[unreachable\]/);
  });

  it('completa contra la URL que registró la detección, con los datos del modelo detectado', async () => {
    /** @type {RequestInit | undefined} */
    let chatInit;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
        if (url.endsWith('/api/chat')) {
          chatInit = init;
          return streamed('{"message":{"content":"Ho"}}\n{"message":{"content":"la"}}\n');
        }
        return ollamaOnly(url);
      }),
    );
    const registry = new EngineRegistry({ detectors: onlyOllama });
    await registry.detect();
    /** @type {string[]} */
    const chunks = [];

    const answer = await registry.complete(
      // The renderer claims thinking: false; the detected model says otherwise and wins.
      { ...request, model: { id: 'ollama:qwen3.5:latest', thinking: false, name: 'otro' } },
      { signal: new AbortController().signal, onChunk: (chunk) => chunks.push(chunk.text) },
    );

    expect(answer).toBe('Hola');
    expect(chunks).toEqual(['Ho', 'la']);
    const body = JSON.parse(String(chatInit?.body));
    expect(body).toMatchObject({ model: 'qwen3.5:latest', think: false, stream: true });
  });

  it('distingue cancelación de timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((/** @type {string} */ url, /** @type {RequestInit} */ init) =>
        url.endsWith('/api/chat')
          ? new Promise((_resolve, reject) =>
              init.signal?.addEventListener('abort', () => reject(new Error('abort'))),
            )
          : ollamaOnly(url),
      ),
    );

    const slow = new EngineRegistry({ detectors: onlyOllama, timeoutMs: 10 });
    await slow.detect();
    await expect(
      slow.complete(request, { signal: new AbortController().signal, onChunk: () => {} }),
    ).rejects.toThrow(/^\[timeout\]/);

    const registry = new EngineRegistry({ detectors: onlyOllama });
    await registry.detect();
    const controller = new AbortController();
    const pending = registry.complete(request, { signal: controller.signal, onChunk: () => {} });
    controller.abort();
    await expect(pending).rejects.toThrow(/^\[aborted\]/);
  });
});

describe('toEngineError', () => {
  it('un fallo de red sin cancelación es unreachable', () => {
    expect(
      toEngineError(new Error('ECONNREFUSED'), { userAborted: false, timedOut: false }).code,
    ).toBe('unreachable');
  });
});
