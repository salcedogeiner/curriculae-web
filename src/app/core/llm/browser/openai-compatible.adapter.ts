import type {
  CompletionOptions,
  CompletionRequest,
  EngineDescriptor,
  EngineId,
  ModelDescriptor,
} from '../engine.types';
import { httpError, probeJson, readLines } from './http';

/** llama.cpp and LM Studio speak the same OpenAI-compatible dialect. */
export interface OpenAiCompatibleServer {
  readonly id: Extract<EngineId, 'llamacpp' | 'lmstudio'>;
  readonly label: string;
  readonly baseUrl: string;
}

export const OPENAI_COMPATIBLE_SERVERS: readonly OpenAiCompatibleServer[] = [
  { id: 'llamacpp', label: 'llama.cpp', baseUrl: 'http://127.0.0.1:8080' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234' },
];

export async function detectOpenAiCompatible(
  server: OpenAiCompatibleServer,
): Promise<EngineDescriptor> {
  const probe = await probeJson(`${server.baseUrl}/v1/models`);
  const base = {
    id: server.id,
    label: server.label,
    tier: 'local',
    location: server.baseUrl,
  } as const;

  if (probe.kind !== 'ok') {
    return { ...base, status: probe.kind === 'blocked' ? 'blocked' : 'unavailable', models: [] };
  }

  const models = parseOpenAiModels(server, probe.json);
  return { ...base, status: models.length > 0 ? 'ready' : 'no-models', models };
}

export function parseOpenAiModels(
  server: OpenAiCompatibleServer,
  json: unknown,
): ModelDescriptor[] {
  const list = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((entry): ModelDescriptor[] => {
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== 'string' || id === '') {
      return [];
    }
    return [
      {
        id: `${server.id}:${id}`,
        engineId: server.id,
        tier: 'local',
        name: id,
        // llama.cpp reports the GGUF path; the file name is what a user recognises.
        label: id.split(/[\\/]/).pop() ?? id,
        details: null,
        thinking: false,
      },
    ];
  });
}

export async function completeWithOpenAiCompatible(
  server: OpenAiCompatibleServer,
  request: CompletionRequest,
  options: CompletionOptions & { signal: AbortSignal },
): Promise<string> {
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
    const event = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
    };
    const delta = event.choices?.[0]?.delta;
    if (delta?.reasoning_content) {
      options.onChunk?.({ kind: 'thinking', text: delta.reasoning_content });
    }
    if (delta?.content) {
      content += delta.content;
      options.onChunk?.({ kind: 'content', text: delta.content });
    }
  }
  return content;
}
