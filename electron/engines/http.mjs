// @ts-check
import { EngineError, contextWindowFor, httpError, probeJson, readLines } from './shared.mjs';

/**
 * Local model servers, called from the main process (no CORS involved).
 * Endpoints as verified in the llm-integration skill. This mirrors the browser
 * adapters in src/app/core/llm/browser — keep both in step when an endpoint
 * changes.
 */

/** @typedef {import('./shared.mjs').EngineDescriptor} EngineDescriptor */
/** @typedef {import('./shared.mjs').ModelDescriptor} ModelDescriptor */
/** @typedef {import('./shared.mjs').CompletionRequest} CompletionRequest */
/** @typedef {import('./shared.mjs').RunOptions} RunOptions */

/** `OLLAMA_HOST` may be `host:port` or a full URL; the app must honour it. */
export function ollamaBaseUrl(env = process.env) {
  const host = env['OLLAMA_HOST']?.trim();
  if (!host) {
    return 'http://127.0.0.1:11434';
  }
  const withScheme = /^https?:\/\//.test(host) ? host : `http://${host}`;
  return withScheme.replace(/\/+$/, '').replace('://0.0.0.0', '://127.0.0.1');
}

/**
 * @param {string} baseUrl
 * @returns {Promise<EngineDescriptor>}
 */
export async function detectOllama(baseUrl) {
  const json = await probeJson(`${baseUrl}/api/tags`);
  const models = json === null ? [] : parseOllamaTags(json);
  return {
    id: 'ollama',
    label: 'Ollama',
    tier: 'local',
    location: baseUrl,
    status: json === null ? 'unavailable' : models.length > 0 ? 'ready' : 'no-models',
    models,
  };
}

/**
 * @param {unknown} json
 * @returns {ModelDescriptor[]}
 */
export function parseOllamaTags(json) {
  const list = /** @type {{ models?: unknown }} */ (json)?.models;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((entry) => {
    const name = entry?.name;
    if (typeof name !== 'string' || name === '') {
      return [];
    }
    const capabilities = Array.isArray(entry.capabilities) ? entry.capabilities : null;
    if (capabilities && !capabilities.includes('completion')) {
      return [];
    }
    const details = [entry.details?.parameter_size, entry.details?.quantization_level]
      .filter((part) => typeof part === 'string' && part !== '')
      .join(' · ');
    return [
      /** @type {ModelDescriptor} */ ({
        id: `ollama:${name}`,
        engineId: 'ollama',
        tier: 'local',
        name,
        label: name.replace(/:latest$/, ''),
        details: details || null,
        thinking: capabilities?.includes('thinking') ?? false,
      }),
    ];
  });
}

/**
 * @param {string} baseUrl
 * @param {CompletionRequest} request
 * @param {RunOptions} options
 */
export async function completeWithOllama(baseUrl, request, options) {
  const promptChars = request.messages.reduce((sum, message) => sum + message.content.length, 0);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: request.model.name,
      messages: request.messages,
      stream: true,
      ...(request.model.thinking ? { think: request.reason ?? false } : {}),
      ...(request.jsonSchema ? { format: request.jsonSchema } : {}),
      options: { temperature: request.temperature, num_ctx: contextWindowFor(promptChars) },
    }),
    signal: options.signal,
  });
  if (!response.ok) {
    throw await httpError(response);
  }

  let content = '';
  for await (const line of readLines(response)) {
    if (!line.trim()) {
      continue;
    }
    const event = JSON.parse(line);
    if (event.error) {
      throw new EngineError('engine-failed', String(event.error));
    }
    if (event.message?.thinking) {
      options.onChunk({ kind: 'thinking', text: event.message.thinking });
    }
    if (event.message?.content) {
      content += event.message.content;
      options.onChunk({ kind: 'content', text: event.message.content });
    }
  }
  return content;
}

/** @typedef {{ id: 'llamacpp' | 'lmstudio', label: string, baseUrl: string }} OpenAiServer */

/** @type {readonly OpenAiServer[]} */
export const OPENAI_COMPATIBLE_SERVERS = [
  { id: 'llamacpp', label: 'llama.cpp', baseUrl: 'http://127.0.0.1:8080' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234' },
];

/**
 * @param {OpenAiServer} server
 * @returns {Promise<EngineDescriptor>}
 */
export async function detectOpenAiCompatible(server) {
  const json = await probeJson(`${server.baseUrl}/v1/models`);
  const list = /** @type {{ data?: unknown }} */ (json)?.data;
  /** @type {ModelDescriptor[]} */
  const models = Array.isArray(list)
    ? list.flatMap((entry) =>
        typeof entry?.id === 'string' && entry.id !== ''
          ? [
              {
                id: `${server.id}:${entry.id}`,
                engineId: server.id,
                tier: /** @type {const} */ ('local'),
                name: entry.id,
                label: entry.id.split(/[\\/]/).pop() ?? entry.id,
                details: null,
                thinking: false,
              },
            ]
          : [],
      )
    : [];
  return {
    id: server.id,
    label: server.label,
    tier: 'local',
    location: server.baseUrl,
    status: json === null ? 'unavailable' : models.length > 0 ? 'ready' : 'no-models',
    models,
  };
}

/**
 * @param {OpenAiServer} server
 * @param {CompletionRequest} request
 * @param {RunOptions} options
 */
export async function completeWithOpenAiCompatible(server, request, options) {
  const response = await fetch(`${server.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: request.model.name,
      messages: request.messages,
      temperature: request.temperature,
      stream: true,
    }),
    signal: options.signal,
  });
  if (!response.ok) {
    throw await httpError(response);
  }

  let content = '';
  for await (const line of readLines(response)) {
    const data = line.startsWith('data:') ? line.slice(5).trim() : '';
    if (!data || data === '[DONE]') {
      continue;
    }
    const delta = JSON.parse(data).choices?.[0]?.delta;
    if (delta?.reasoning_content) {
      options.onChunk({ kind: 'thinking', text: delta.reasoning_content });
    }
    if (delta?.content) {
      content += delta.content;
      options.onChunk({ kind: 'content', text: delta.content });
    }
  }
  return content;
}
