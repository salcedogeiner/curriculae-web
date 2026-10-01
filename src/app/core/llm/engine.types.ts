/**
 * Shared vocabulary for every model engine (llm-integration skill).
 *
 * These types also cross the Electron bridge (core/desktop/desktop-api.ts), so
 * they are plain data: no classes, no functions, nothing that structured clone
 * would drop.
 */

/**
 * The privacy promise, not an implementation detail (AGENTS.md §5):
 * `local` never sends the résumé off the device; `agent` may forward it to a
 * cloud provider and needs an explicit, revocable opt-in.
 */
export type EngineTier = 'local' | 'agent';

export type EngineId = 'ollama' | 'llamacpp' | 'lmstudio' | 'claude' | 'opencode';

/**
 * `ready` — reachable and lists at least one model.
 * `no-models` — reachable, but there is nothing to select.
 * `unavailable` — not running or not installed; a normal outcome, not an error.
 * `blocked` — the server answers, but the browser refused the response (CORS).
 */
export type EngineStatus = 'ready' | 'no-models' | 'unavailable' | 'blocked';

export interface ModelDescriptor {
  /** `<engineId>:<model name>`, unique across engines. */
  readonly id: string;
  readonly engineId: EngineId;
  readonly tier: EngineTier;
  /** The name the engine itself expects in a request. */
  readonly name: string;
  readonly label: string;
  /** Short, already human readable: "9.7B · Q4_K_M". */
  readonly details: string | null;
  /** Emits reasoning tokens before the answer (qwen3.5): stream, never trust a cut reply. */
  readonly thinking: boolean;
}

export interface EngineDescriptor {
  readonly id: EngineId;
  readonly label: string;
  readonly tier: EngineTier;
  readonly status: EngineStatus;
  /** Where it was found: a base URL for servers, a binary path for CLI agents. */
  readonly location: string | null;
  readonly models: readonly ModelDescriptor[];
}

/** Generous on purpose: a 9 B local model rewriting a long CV can take minutes. */
export const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface CompletionRequest {
  readonly model: ModelDescriptor;
  readonly messages: readonly ChatMessage[];
  readonly temperature: number;
  /**
   * A JSON Schema the answer must follow. Engines that support constrained
   * output (Ollama `format`) enforce it; the rest only get it in the prompt.
   * Either way the caller validates the result — the model is never trusted.
   */
  readonly jsonSchema?: Readonly<Record<string, unknown>>;
  /**
   * Let a thinking model reason before answering. Off by default: reasoning
   * costs a laptop a minute, and the JSON contract does not need it. Ignored by
   * models that cannot think.
   */
  readonly reason?: boolean;
}

export interface CompletionChunk {
  readonly kind: 'content' | 'thinking';
  readonly text: string;
}

export interface CompletionOptions {
  readonly signal?: AbortSignal;
  readonly onChunk?: (chunk: CompletionChunk) => void;
}

/**
 * Every failure a model call can end in. The UI message differs for each, so
 * they are never collapsed into one generic "something went wrong".
 */
export type LlmErrorCode =
  | 'aborted'
  | 'timeout'
  | 'unreachable'
  | 'blocked'
  | 'http'
  | 'engine-failed'
  | 'empty-response'
  | 'malformed-json'
  | 'consent-required';

export const LLM_ERROR_CODES: readonly LlmErrorCode[] = [
  'aborted',
  'timeout',
  'unreachable',
  'blocked',
  'http',
  'engine-failed',
  'empty-response',
  'malformed-json',
  'consent-required',
];

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** The main process can only send a message string back; it prefixes the code. */
export function llmErrorFromMessage(message: string): LlmError {
  const match = /^\[([a-z-]+)\]\s*/.exec(message);
  const code = match?.[1] as LlmErrorCode | undefined;
  if (code && LLM_ERROR_CODES.includes(code)) {
    return new LlmError(code, message.slice(match![0].length));
  }
  return new LlmError('engine-failed', message);
}

export function isAgentModel(model: Pick<ModelDescriptor, 'tier'> | null): boolean {
  return model?.tier === 'agent';
}
