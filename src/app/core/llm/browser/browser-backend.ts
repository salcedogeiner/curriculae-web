import {
  GENERATION_TIMEOUT_MS,
  LlmError,
  type CompletionOptions,
  type CompletionRequest,
  type EngineDescriptor,
} from '../engine.types';
import type { LlmBackend } from '../llm-backend';
import { LinkedAbort } from './http';
import { completeWithOllama, detectOllama } from './ollama.adapter';
import {
  OPENAI_COMPATIBLE_SERVERS,
  completeWithOpenAiCompatible,
  detectOpenAiCompatible,
} from './openai-compatible.adapter';

/** `fetch` straight to the local servers. Needs CORS on each of them. */
export class BrowserLlmBackend implements LlmBackend {
  readonly kind = 'browser';

  constructor(private readonly timeoutMs = GENERATION_TIMEOUT_MS) {}

  detect(): Promise<EngineDescriptor[]> {
    // In parallel, and each probe already swallows its own failure.
    return Promise.all([
      detectOllama(),
      ...OPENAI_COMPATIBLE_SERVERS.map((server) => detectOpenAiCompatible(server)),
    ]);
  }

  async complete(request: CompletionRequest, options: CompletionOptions): Promise<string> {
    const link = new LinkedAbort(options.signal, this.timeoutMs);
    const linked = { ...options, signal: link.signal };

    try {
      const engine = request.model.engineId;
      if (engine === 'ollama') {
        return await completeWithOllama(request, linked);
      }
      const server = OPENAI_COMPATIBLE_SERVERS.find((candidate) => candidate.id === engine);
      if (server) {
        return await completeWithOpenAiCompatible(server, request, linked);
      }
      throw new LlmError(
        'unreachable',
        `El motor ${engine} solo está disponible en la app de escritorio`,
      );
    } catch (error) {
      throw link.toError(error);
    } finally {
      link.dispose();
    }
  }
}
