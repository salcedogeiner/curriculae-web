// @ts-check
import { completeWithClaude, completeWithOpencode, detectClaude, detectOpencode } from './cli.mjs';
import {
  OPENAI_COMPATIBLE_SERVERS,
  completeWithOllama,
  completeWithOpenAiCompatible,
  detectOllama,
  detectOpenAiCompatible,
  ollamaBaseUrl,
} from './http.mjs';
import { EngineError, GENERATION_TIMEOUT_MS, toEngineError } from './shared.mjs';

/** @typedef {import('./shared.mjs').EngineDescriptor} EngineDescriptor */
/** @typedef {import('./shared.mjs').ModelDescriptor} ModelDescriptor */
/** @typedef {import('./shared.mjs').CompletionRequest} CompletionRequest */
/** @typedef {import('./shared.mjs').CompletionChunk} CompletionChunk */

/**
 * The engine registry of the main process.
 *
 * The renderer is not trusted to name a binary or a URL: a completion is only
 * accepted for a model the last detection actually found, and it runs against
 * the location recorded by that detection. So a compromised page cannot turn
 * `llm:complete` into "run this executable" or "POST to that host".
 */
export class EngineRegistry {
  /** @type {Map<string, { model: ModelDescriptor, engine: EngineDescriptor }>} */
  #known = new Map();

  /**
   * @param {{
   *   timeoutMs?: number,
   *   detectors?: readonly (() => Promise<EngineDescriptor>)[],
   * }} [options] `detectors` is a test seam; by default every known engine is probed.
   */
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? GENERATION_TIMEOUT_MS;
    this.detectors = options.detectors ?? defaultDetectors(process.env);
  }

  /** @returns {Promise<EngineDescriptor[]>} */
  async detect() {
    // In parallel; a detector that throws is dropped, never fatal.
    const settled = await Promise.allSettled(this.detectors.map((detector) => detector()));
    const engines = settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );

    this.#known.clear();
    for (const engine of engines) {
      for (const model of engine.models) {
        this.#known.set(model.id, { model, engine });
      }
    }
    return engines;
  }

  /**
   * @param {unknown} request untrusted, straight from IPC
   * @param {{ signal: AbortSignal, onChunk: (chunk: CompletionChunk) => void }} options
   * @returns {Promise<string>}
   */
  async complete(request, options) {
    const valid = validateRequest(request);
    let entry = this.#known.get(valid.modelId);
    if (!entry) {
      // Engines come and go behind the app's back; one fresh look before refusing.
      await this.detect();
      entry = this.#known.get(valid.modelId);
    }
    if (!entry || entry.engine.location === null) {
      throw new EngineError('unreachable', 'El modelo ya no está disponible. Vuelve a detectar.');
    }

    const state = { userAborted: false, timedOut: false };
    const controller = new AbortController();
    const timer = setTimeout(() => {
      state.timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const onUserAbort = () => {
      state.userAborted = true;
      controller.abort();
    };
    if (options.signal.aborted) {
      onUserAbort();
    }
    options.signal.addEventListener('abort', onUserAbort, { once: true });

    /** @type {CompletionRequest} */
    const run = { ...valid.request, model: entry.model };
    const runOptions = { signal: controller.signal, onChunk: options.onChunk };
    const location = entry.engine.location;

    try {
      switch (entry.model.engineId) {
        case 'ollama':
          return await completeWithOllama(location, run, runOptions);
        case 'llamacpp':
        case 'lmstudio': {
          const server = { id: entry.model.engineId, label: entry.engine.label, baseUrl: location };
          return await completeWithOpenAiCompatible(server, run, runOptions);
        }
        case 'claude':
          return await completeWithClaude(location, run, runOptions);
        case 'opencode':
          return await completeWithOpencode(location, run, runOptions);
        default:
          throw new EngineError('unreachable', `Motor desconocido: ${entry.model.engineId}`);
      }
    } catch (error) {
      throw toEngineError(error, state);
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', onUserAbort);
    }
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {(() => Promise<EngineDescriptor>)[]}
 */
export function defaultDetectors(env) {
  return [
    () => detectOllama(ollamaBaseUrl(env)),
    ...OPENAI_COMPATIBLE_SERVERS.map((server) => () => detectOpenAiCompatible(server)),
    detectClaude,
    detectOpencode,
  ];
}

/**
 * @param {unknown} value
 * @returns {{ modelId: string, request: Omit<CompletionRequest, 'model'> }}
 */
export function validateRequest(value) {
  const request = /** @type {Record<string, any>} */ (value);
  const modelId = request?.model?.id;
  const messages = request?.messages;
  const temperature = request?.temperature;

  const messagesOk =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(
      (m) => ['system', 'user', 'assistant'].includes(m?.role) && typeof m?.content === 'string',
    );
  if (typeof modelId !== 'string' || !messagesOk || typeof temperature !== 'number') {
    throw new EngineError('engine-failed', 'Petición al modelo no válida');
  }

  const schema = request.jsonSchema;
  return {
    modelId,
    request: {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: Math.min(Math.max(temperature, 0), 2),
      ...(schema && typeof schema === 'object' ? { jsonSchema: schema } : {}),
      ...(request.reason === true ? { reason: true } : {}),
    },
  };
}
