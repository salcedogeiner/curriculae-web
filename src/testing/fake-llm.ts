import type {
  CompletionOptions,
  CompletionRequest,
  EngineDescriptor,
  ModelDescriptor,
} from '../app/core/llm/engine.types';
import type { LlmBackend } from '../app/core/llm/llm-backend';

/**
 * Test doubles for the model layer. Specs only: nothing in `src/app` imports
 * this file, so it never reaches a bundle.
 */

export const LOCAL_MODEL: ModelDescriptor = {
  id: 'ollama:qwen3.5:latest',
  engineId: 'ollama',
  tier: 'local',
  name: 'qwen3.5:latest',
  label: 'qwen3.5',
  details: '9.7B · Q4_K_M',
  thinking: true,
};

export const AGENT_MODEL: ModelDescriptor = {
  id: 'claude:sonnet',
  engineId: 'claude',
  tier: 'agent',
  name: 'sonnet',
  label: 'Claude Sonnet',
  details: null,
  thinking: false,
};

export const OLLAMA_ENGINE: EngineDescriptor = {
  id: 'ollama',
  label: 'Ollama',
  tier: 'local',
  status: 'ready',
  location: 'http://127.0.0.1:11434',
  models: [LOCAL_MODEL],
};

export const CLAUDE_ENGINE: EngineDescriptor = {
  id: 'claude',
  label: 'Claude',
  tier: 'agent',
  status: 'ready',
  location: '/usr/bin/claude',
  models: [AGENT_MODEL],
};

type Responder = (
  request: CompletionRequest,
  options: CompletionOptions,
) => Promise<string> | string;

/** A backend whose engines and answers each spec sets explicitly. */
export class FakeLlmBackend implements LlmBackend {
  readonly kind: 'desktop' | 'browser' = 'browser';
  engines: EngineDescriptor[] = [OLLAMA_ENGINE];
  readonly requests: CompletionRequest[] = [];
  private readonly answers: Responder[] = [];

  /** Queues answers, consumed one per `complete` call. */
  respond(...answers: (string | Responder)[]): this {
    this.answers.push(
      ...answers.map((answer) => (typeof answer === 'string' ? () => answer : answer)),
    );
    return this;
  }

  async detect(): Promise<EngineDescriptor[]> {
    return this.engines;
  }

  async complete(request: CompletionRequest, options: CompletionOptions): Promise<string> {
    this.requests.push(request);
    const next = this.answers.shift();
    if (!next) {
      throw new Error('FakeLlmBackend: no queued answer');
    }
    const answer = await next(request, options);
    options.onChunk?.({ kind: 'content', text: answer });
    return answer;
  }
}

/** A minimal analysis answer, valid against the contract, quoting `cvQuote` from the CV. */
export function analysisAnswer(cvQuote: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    jobTitle: 'Desarrolladora Angular',
    company: 'Acme',
    summary: 'Buen encaje.',
    requirements: [
      {
        text: 'Angular',
        category: 'skill',
        importance: 'must',
        verdict: 'match',
        evidence: cvQuote,
      },
      {
        text: 'Kubernetes',
        category: 'skill',
        importance: 'nice',
        verdict: 'missing',
        evidence: null,
      },
    ],
    strengths: ['Experiencia con Angular'],
    ...extra,
  });
}
