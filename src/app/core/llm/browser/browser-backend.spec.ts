import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_MODEL, LOCAL_MODEL } from '../../../../testing/fake-llm';
import { LlmError, type CompletionRequest } from '../engine.types';
import { BrowserLlmBackend } from './browser-backend';
import { contextWindowFor } from './http';
import { detectOllama, ollamaChatBody, parseOllamaTags } from './ollama.adapter';
import { OPENAI_COMPATIBLE_SERVERS, detectOpenAiCompatible } from './openai-compatible.adapter';

const TAGS = {
  models: [
    {
      name: 'qwen3.5:latest',
      details: { parameter_size: '9.7B', quantization_level: 'Q4_K_M' },
      capabilities: ['completion', 'vision', 'tools', 'thinking'],
    },
    { name: 'nomic-embed-text:latest', capabilities: ['embedding'] },
    { name: 'llama3.2:3b' },
  ],
};

/** A streamed body, one chunk per string. */
function streamed(...chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function request(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    model: LOCAL_MODEL,
    messages: [
      { role: 'system', content: 'Sé breve.' },
      { role: 'user', content: 'Hola' },
    ],
    temperature: 0.2,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Ollama (navegador)', () => {
  it('lista los modelos de chat y omite los de embeddings', () => {
    const models = parseOllamaTags(TAGS);

    expect(models.map((model) => model.id)).toEqual([
      'ollama:qwen3.5:latest',
      'ollama:llama3.2:3b',
    ]);
    expect(models[0]).toMatchObject({
      label: 'qwen3.5',
      details: '9.7B · Q4_K_M',
      thinking: true,
      tier: 'local',
    });
    expect(models[1].thinking).toBe(false);
  });

  it('un listado con forma inesperada no rompe nada', () => {
    expect(parseOllamaTags({ models: 'nope' })).toEqual([]);
    expect(parseOllamaTags(null)).toEqual([]);
  });

  it('detecta un Ollama sano', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(TAGS)),
    );

    const engine = await detectOllama();
    expect(engine.status).toBe('ready');
    expect(engine.models).toHaveLength(2);
  });

  it('un servidor apagado es "unavailable", sin lanzar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );

    await expect(detectOllama()).resolves.toMatchObject({ status: 'unavailable', models: [] });
  });

  it('distingue CORS de servidor apagado: el no-cors responde, el normal no', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.mode === 'no-cors'
          ? new Response(null, { status: 200 })
          : Promise.reject(new TypeError('Failed to fetch')),
      ),
    );

    await expect(detectOllama()).resolves.toMatchObject({ status: 'blocked' });
  });

  it('desactiva el razonamiento solo en modelos que piensan y pasa el esquema como format', () => {
    const schema = { type: 'object' };
    const thinking = ollamaChatBody(request({ jsonSchema: schema }));
    const plain = ollamaChatBody(request({ model: { ...LOCAL_MODEL, thinking: false } }));

    expect(thinking).toMatchObject({
      model: 'qwen3.5:latest',
      stream: true,
      think: false,
      format: schema,
    });
    expect(plain).not.toHaveProperty('think');
    expect(plain).not.toHaveProperty('format');
  });

  it('amplía el contexto según el tamaño del prompt, con tope', () => {
    expect(contextWindowFor(100)).toBe(8192);
    expect(contextWindowFor(30_000)).toBe(16384);
    expect(contextWindowFor(1_000_000)).toBe(32768);
  });

  it('hace POST a /api/chat y concatena el stream NDJSON, aunque una línea llegue partida', async () => {
    const fetchMock = vi.fn(async () =>
      streamed(
        '{"message":{"thinking":"mmm"}}\n{"message":{"content":"Ho',
        'la"}}\n{"message":{"content":" Ana"}}\n',
        '{"done":true}',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];

    const answer = await new BrowserLlmBackend().complete(request(), {
      onChunk: (chunk) => chunks.push(`${chunk.kind}:${chunk.text}`),
    });

    expect(answer).toBe('Hola Ana');
    expect(chunks).toEqual(['thinking:mmm', 'content:Hola', 'content: Ana']);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).messages).toHaveLength(2);
  });

  it('un error en el stream se convierte en engine-failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamed('{"error":"model not found"}\n')),
    );

    await expect(new BrowserLlmBackend().complete(request(), {})).rejects.toMatchObject({
      code: 'engine-failed',
    });
  });

  it('un 404 es http', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );

    await expect(new BrowserLlmBackend().complete(request(), {})).rejects.toMatchObject({
      code: 'http',
    });
  });

  it('cancelar aborta la petición y se informa como aborted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const controller = new AbortController();

    const pending = new BrowserLlmBackend().complete(request(), { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
  });

  it('un modelo que tarda demasiado se informa como timeout, no como cancelado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );

    await expect(new BrowserLlmBackend(10).complete(request(), {})).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  it('un servidor que no responde es unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );

    await expect(new BrowserLlmBackend().complete(request(), {})).rejects.toMatchObject({
      code: 'unreachable',
    });
  });

  it('un agente no se puede usar desde el navegador', async () => {
    const error = await new BrowserLlmBackend()
      .complete(request({ model: AGENT_MODEL }), {})
      .catch((e) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.code).toBe('unreachable');
  });
});

describe('servidores OpenAI-compatibles (navegador)', () => {
  it('detecta llama.cpp y muestra el nombre del archivo GGUF', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [{ id: '/models/qwen2.5-7b.gguf' }] })),
    );

    const engine = await detectOpenAiCompatible(OPENAI_COMPATIBLE_SERVERS[0]);
    expect(engine).toMatchObject({ id: 'llamacpp', status: 'ready' });
    expect(engine.models[0]).toMatchObject({
      id: 'llamacpp:/models/qwen2.5-7b.gguf',
      label: 'qwen2.5-7b.gguf',
    });
  });

  it('lee el stream SSE de /v1/chat/completions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamed(
          'data: {"choices":[{"delta":{"content":"Ho"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"la"}}]}\n\ndata: [DONE]\n\n',
        ),
      ),
    );
    const model = { ...LOCAL_MODEL, id: 'llamacpp:m', engineId: 'llamacpp' as const, name: 'm' };

    await expect(new BrowserLlmBackend().complete(request({ model }), {})).resolves.toBe('Hola');
  });
});
