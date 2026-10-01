// @ts-check
/**
 * Shared plumbing for the engines the main process talks to.
 *
 * The renderer receives failures as `Error` messages only (IPC drops custom
 * properties), so every failure here is an `EngineError` whose message starts
 * with `[code]`; `llmErrorFromMessage` in core/llm/engine.types.ts reads it
 * back on the other side. The codes are the renderer's `LlmErrorCode`.
 */

/** @typedef {import('../../src/app/core/llm/engine.types').LlmErrorCode} LlmErrorCode */
/** @typedef {import('../../src/app/core/llm/engine.types').CompletionRequest} CompletionRequest */
/** @typedef {import('../../src/app/core/llm/engine.types').CompletionChunk} CompletionChunk */
/** @typedef {import('../../src/app/core/llm/engine.types').EngineDescriptor} EngineDescriptor */
/** @typedef {import('../../src/app/core/llm/engine.types').ModelDescriptor} ModelDescriptor */
/** @typedef {{ signal: AbortSignal, onChunk: (chunk: CompletionChunk) => void }} RunOptions */

export const PROBE_TIMEOUT_MS = 1500;
export const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

export class EngineError extends Error {
  /**
   * @param {LlmErrorCode} code
   * @param {string} message
   */
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.name = 'EngineError';
    this.code = code;
  }
}

/**
 * GETs a JSON endpoint with a short timeout. Resolves `null` on any failure:
 * a server that is not running is a normal outcome (llm-integration skill).
 * There is no CORS in the main process, so "blocked" cannot happen here.
 *
 * @param {string} url
 * @returns {Promise<unknown | null>}
 */
export async function probeJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Yields a streamed body one line at a time.
 *
 * @param {Response} response
 * @returns {AsyncGenerator<string>}
 */
export async function* readLines(response) {
  if (!response.body) {
    yield* (await response.text()).split('\n');
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      yield buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer) {
    yield buffer;
  }
}

/**
 * @param {Response} response
 * @returns {Promise<EngineError>}
 */
export async function httpError(response) {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    /* the status is enough */
  }
  return new EngineError('http', `HTTP ${response.status} ${detail}`.trim());
}

/**
 * Context window that fits the prompt plus a CV-sized answer; Ollama's default
 * is small and truncates silently. Same estimate as the browser adapter.
 *
 * @param {number} promptChars
 */
export function contextWindowFor(promptChars) {
  const needed = Math.ceil(promptChars / 3) + 4096;
  const rounded = Math.ceil(needed / 4096) * 4096;
  return Math.min(Math.max(rounded, 8192), 32768);
}

/**
 * Normalises whatever a run threw into an `EngineError`, telling a user cancel
 * from a timeout from a dead connection.
 *
 * @param {unknown} error
 * @param {{ userAborted: boolean, timedOut: boolean }} state
 * @returns {EngineError}
 */
export function toEngineError(error, state) {
  if (error instanceof EngineError) {
    return error;
  }
  if (state.timedOut) {
    return new EngineError('timeout', 'El modelo tardó demasiado en responder');
  }
  if (state.userAborted) {
    return new EngineError('aborted', 'Generación cancelada');
  }
  const message = error instanceof Error ? error.message : String(error);
  return new EngineError('unreachable', message);
}
