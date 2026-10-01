import {
  LlmError,
  type CompletionOptions,
  type CompletionRequest,
  type EngineDescriptor,
  type ModelDescriptor,
} from '../engine.types';
import { contextWindowFor, httpError, probeJson, readLines } from './http';

export const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

/**
 * Ollama, native API (llm-integration skill, verified table):
 * `GET /api/tags` lists models, `POST /api/chat` streams NDJSON.
 */
export async function detectOllama(baseUrl = OLLAMA_BASE_URL): Promise<EngineDescriptor> {
  const probe = await probeJson(`${baseUrl}/api/tags`);
  const base = { id: 'ollama', label: 'Ollama', tier: 'local', location: baseUrl } as const;

  if (probe.kind !== 'ok') {
    return { ...base, status: probe.kind === 'blocked' ? 'blocked' : 'unavailable', models: [] };
  }

  const models = parseOllamaTags(probe.json);
  return { ...base, status: models.length > 0 ? 'ready' : 'no-models', models };
}

export function parseOllamaTags(json: unknown): ModelDescriptor[] {
  const list = (json as { models?: unknown } | null)?.models;
  if (!Array.isArray(list)) {
    return [];
  }

  return list.flatMap((entry): ModelDescriptor[] => {
    const model = entry as {
      name?: unknown;
      details?: { parameter_size?: unknown; quantization_level?: unknown };
      capabilities?: unknown;
    };
    if (typeof model.name !== 'string' || model.name === '') {
      return [];
    }
    // Embedding-only models cannot chat; listing them is a trap.
    const capabilities = Array.isArray(model.capabilities) ? model.capabilities : null;
    if (capabilities && !capabilities.includes('completion')) {
      return [];
    }
    const details = [model.details?.parameter_size, model.details?.quantization_level]
      .filter((part): part is string => typeof part === 'string' && part !== '')
      .join(' · ');

    return [
      {
        id: `ollama:${model.name}`,
        engineId: 'ollama',
        tier: 'local',
        name: model.name,
        label: model.name.replace(/:latest$/, ''),
        details: details || null,
        thinking: capabilities?.includes('thinking') ?? false,
      },
    ];
  });
}

export function ollamaChatBody(request: CompletionRequest): Record<string, unknown> {
  const promptChars = request.messages.reduce((sum, message) => sum + message.content.length, 0);
  return {
    model: request.model.name,
    messages: request.messages,
    stream: true,
    // Only sent to models that support it: older Ollama builds reject the flag
    // on other models.
    ...(request.model.thinking ? { think: request.reason ?? false } : {}),
    ...(request.jsonSchema ? { format: request.jsonSchema } : {}),
    options: { temperature: request.temperature, num_ctx: contextWindowFor(promptChars) },
  };
}

export async function completeWithOllama(
  request: CompletionRequest,
  options: CompletionOptions & { signal: AbortSignal },
  baseUrl = OLLAMA_BASE_URL,
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ollamaChatBody(request)),
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
    const event = JSON.parse(line) as {
      message?: { content?: string; thinking?: string };
      error?: string;
    };
    if (event.error) {
      throw new LlmError('engine-failed', event.error);
    }
    if (event.message?.thinking) {
      options.onChunk?.({ kind: 'thinking', text: event.message.thinking });
    }
    if (event.message?.content) {
      content += event.message.content;
      options.onChunk?.({ kind: 'content', text: event.message.content });
    }
  }
  return content;
}
