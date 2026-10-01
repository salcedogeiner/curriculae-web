import { Injectable, computed, inject, signal } from '@angular/core';
import { PreferencesRepository, type Preferences } from '../storage/preferences.repository';
import {
  LlmError,
  isAgentModel,
  type CompletionOptions,
  type CompletionRequest,
  type EngineDescriptor,
  type ModelDescriptor,
} from './engine.types';
import { LLM_BACKEND } from './llm-backend';

/**
 * THE facade every feature goes through to reach a model (AGENTS.md §1.2).
 *
 * It owns three things no feature may bypass:
 * 1. detection — which engines and models exist on this machine right now;
 * 2. the selection, persisted, and never defaulting to an `agent` engine;
 * 3. the privacy gate — a completion on an `agent` model without the user's
 *    explicit, remembered consent is refused here, before any byte leaves.
 */
@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly backend = inject(LLM_BACKEND);
  private readonly repository = inject(PreferencesRepository);

  private readonly stored = this.repository.readPreferences();

  private readonly _engines = signal<readonly EngineDescriptor[]>([]);
  private readonly _detecting = signal(false);
  private readonly _detected = signal(false);
  private readonly _selectedModelId = signal<string | null>(this.stored.selectedModelId);
  private readonly _agentConsent = signal(this.stored.agentConsent);

  readonly backendKind = this.backend.kind;
  readonly engines = this._engines.asReadonly();
  readonly detecting = this._detecting.asReadonly();
  /** True once a detection has finished, so "no engine" is not shown before probing. */
  readonly detected = this._detected.asReadonly();
  readonly agentConsent = this._agentConsent.asReadonly();

  /** Selectable models, in engine order: local engines first. */
  readonly models = computed(() =>
    this._engines()
      .filter((engine) => engine.status === 'ready')
      .flatMap((engine) => engine.models),
  );

  readonly selectedModel = computed<ModelDescriptor | null>(() => {
    const id = this._selectedModelId();
    return this.models().find((model) => model.id === id) ?? null;
  });

  readonly selectedIsAgent = computed(() => isAgentModel(this.selectedModel()));

  /** An agent model is selected but the user has not consented yet. */
  readonly needsConsent = computed(() => this.selectedIsAgent() && !this._agentConsent());

  /** A model is selected and the privacy gate lets it run. */
  readonly ready = computed(() => this.selectedModel() !== null && !this.needsConsent());

  private detection: Promise<void> | null = null;

  /** Probes every engine. Concurrent calls share one run; never rejects. */
  detect(): Promise<void> {
    this.detection ??= this.#runDetection().finally(() => (this.detection = null));
    return this.detection;
  }

  select(modelId: string | null): void {
    const exists = modelId === null || this.models().some((model) => model.id === modelId);
    if (!exists) {
      return;
    }
    this._selectedModelId.set(modelId);
    this.#persist();
  }

  /** Grants or revokes consent for agent engines. Revoking is always one call. */
  setAgentConsent(consent: boolean): void {
    this._agentConsent.set(consent);
    this.#persist();
  }

  async complete(request: CompletionRequest, options: CompletionOptions = {}): Promise<string> {
    if (isAgentModel(request.model) && !this._agentConsent()) {
      throw new LlmError(
        'consent-required',
        'Este motor puede enviar tu hoja de vida a la nube y no has dado tu consentimiento',
      );
    }

    const answer = await this.backend.complete(request, options);
    if (!answer.trim()) {
      throw new LlmError('empty-response', 'El modelo no devolvió texto');
    }
    return answer;
  }

  async #runDetection(): Promise<void> {
    this._detecting.set(true);
    try {
      const engines = await this.backend.detect();
      // Local engines first: they are the default and the privacy-safe choice.
      this._engines.set([...engines].sort((a, b) => tierRank(a) - tierRank(b)));
      this.#reconcileSelection();
    } finally {
      this._detecting.set(false);
      this._detected.set(true);
    }
  }

  /**
   * Keeps a saved choice that still exists. Otherwise falls back to the first
   * LOCAL model — never to an agent one, which must be an explicit user action.
   */
  #reconcileSelection(): void {
    if (this.selectedModel() !== null) {
      return;
    }
    const fallback = this.models().find((model) => model.tier === 'local') ?? null;
    this._selectedModelId.set(fallback?.id ?? this._selectedModelId());
    if (fallback) {
      this.#persist();
    }
  }

  #persist(): void {
    const preferences: Preferences = {
      selectedModelId: this._selectedModelId(),
      agentConsent: this._agentConsent(),
    };
    this.repository.writePreferences(preferences);
  }
}

function tierRank(engine: EngineDescriptor): number {
  return engine.tier === 'local' ? 0 : 1;
}
