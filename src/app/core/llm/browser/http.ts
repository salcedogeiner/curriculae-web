import { LlmError } from '../engine.types';

/**
 * Transport helpers for the browser backend: probing with a short timeout,
 * linking the user's cancel to a generation timeout, and reading a streamed
 * body line by line (NDJSON for Ollama, SSE for OpenAI-compatible servers).
 */

export const PROBE_TIMEOUT_MS = 1500;

export type ProbeResult =
  | { readonly kind: 'ok'; readonly json: unknown }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'down' };

/**
 * GETs a JSON endpoint. Never rejects (llm-integration skill: a failed probe is
 * a normal, silent outcome).
 *
 * A CORS rejection and a refused connection both surface as the same
 * `TypeError: Failed to fetch`. A second, `no-cors` request tells them apart: it
 * resolves with an opaque response when a server is listening and still rejects
 * when nothing is — and the hint the UI shows differs completely for the two.
 */
export async function probeJson(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  try {
    const response = await fetch(url, { signal: timeoutSignal(timeoutMs) });
    if (!response.ok) {
      return { kind: 'down' };
    }
    return { kind: 'ok', json: await response.json() };
  } catch {
    try {
      await fetch(url, { mode: 'no-cors', signal: timeoutSignal(timeoutMs) });
      return { kind: 'blocked' };
    } catch {
      return { kind: 'down' };
    }
  }
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * One signal that fires on the user's cancel or on the generation timeout, and
 * remembers which, because "cancelado" and "tardó demasiado" are different
 * messages (llm-integration skill, "Timeouts").
 */
export class LinkedAbort {
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private expired = false;

  constructor(
    private readonly userSignal: AbortSignal | undefined,
    timeoutMs: number,
  ) {
    this.timer = setTimeout(() => {
      this.expired = true;
      this.controller.abort();
    }, timeoutMs);
    if (userSignal?.aborted) {
      this.controller.abort();
    } else {
      userSignal?.addEventListener('abort', this.onUserAbort, { once: true });
    }
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Turns whatever `fetch` or the reader threw into the right `LlmError`. */
  toError(error: unknown): LlmError {
    if (error instanceof LlmError) {
      return error;
    }
    if (this.expired) {
      return new LlmError('timeout', 'El modelo tardó demasiado en responder', error);
    }
    if (this.userSignal?.aborted || this.controller.signal.aborted) {
      return new LlmError('aborted', 'Generación cancelada', error);
    }
    return new LlmError('unreachable', 'No se pudo conectar con el motor', error);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.userSignal?.removeEventListener('abort', this.onUserAbort);
  }

  private readonly onUserAbort = (): void => this.controller.abort();
}

/** Yields the body one line at a time, as the bytes arrive. */
export async function* readLines(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    const text = await response.text();
    yield* text.split('\n');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
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
  } finally {
    reader.releaseLock();
  }
}

/** A non-2xx answer, with whatever error text the server put in the body. */
export async function httpError(response: Response): Promise<LlmError> {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    /* the status code is enough */
  }
  return new LlmError('http', `HTTP ${response.status} ${detail}`.trim());
}

/**
 * A context window that fits the prompt plus a CV-sized answer. Ollama defaults
 * to a few thousand tokens and truncates silently past that (cv-pipeline skill,
 * "Local model reality"), which reads as the model ignoring half the CV.
 * ~3 characters per token is a deliberately pessimistic estimate for Spanish.
 */
export function contextWindowFor(promptChars: number): number {
  const needed = Math.ceil(promptChars / 3) + 4096;
  const rounded = Math.ceil(needed / 4096) * 4096;
  return Math.min(Math.max(rounded, 8192), 32768);
}
