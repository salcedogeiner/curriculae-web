import type { DesktopApi } from '../../desktop/desktop-api';
import {
  LlmError,
  llmErrorFromMessage,
  type CompletionOptions,
  type CompletionRequest,
  type EngineDescriptor,
} from '../engine.types';
import type { LlmBackend } from '../llm-backend';

let nextRequest = 0;

/**
 * Model calls through the Electron main process. The main process owns the
 * timeout and the actual HTTP request or CLI subprocess; this side only relays
 * the chunks and turns a cancel into an `abort` message — the subprocess or the
 * request is really stopped, not just ignored (llm-integration skill).
 */
export class DesktopLlmBackend implements LlmBackend {
  readonly kind = 'desktop';

  constructor(private readonly api: DesktopApi) {}

  async detect(): Promise<EngineDescriptor[]> {
    try {
      return await this.api.llm.detect();
    } catch {
      // The contract says detect never rejects; a broken bridge degrades to
      // "no engine found" all the same.
      return [];
    }
  }

  async complete(request: CompletionRequest, options: CompletionOptions): Promise<string> {
    if (options.signal?.aborted) {
      throw new LlmError('aborted', 'Generación cancelada');
    }

    const requestId = `req-${Date.now()}-${nextRequest++}`;
    const unsubscribe = this.api.llm.onChunk((id, chunk) => {
      if (id === requestId) {
        options.onChunk?.(chunk);
      }
    });
    const onAbort = (): void => this.api.llm.abort(requestId);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      return await this.api.llm.complete(requestId, request);
    } catch (error) {
      if (options.signal?.aborted) {
        throw new LlmError('aborted', 'Generación cancelada', error);
      }
      throw llmErrorFromMessage(remoteMessage(error));
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      unsubscribe();
    }
  }
}

/**
 * Electron rewrites a rejected `invoke` as
 * "Error invoking remote method 'llm:complete': Error: [code] text".
 */
function remoteMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const marker = message.indexOf('[');
  return marker === -1 ? message : message.slice(marker);
}
