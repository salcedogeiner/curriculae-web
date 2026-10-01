import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import type { MessageKey } from '../../../core/i18n/messages';
import type { EngineDescriptor, EngineStatus } from '../../../core/llm/engine.types';
import { LlmService } from '../../../core/llm/llm.service';

let nextId = 0;

const STATUS_KEYS: Readonly<Record<EngineStatus, MessageKey>> = {
  ready: 'settings.engines.ready',
  'no-models': 'settings.engines.noModels',
  unavailable: 'settings.engines.unavailable',
  blocked: 'settings.engines.blocked',
};

/**
 * Model picker: lists what detection found on this machine — local servers
 * and, in the desktop app, CLI agents — and owns the consent step an `agent`
 * engine requires (AGENTS.md §1.2): a visible badge on every selection, and an
 * explicit, remembered, revocable checkbox before a cloud engine can run.
 */
@Component({
  selector: 'app-model-selector',
  templateUrl: './model-selector.html',
  styleUrl: './model-selector.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelSelector {
  protected readonly i18n = inject(I18n);
  protected readonly llm = inject(LlmService);

  private readonly uid = `model-selector-${nextId++}`;
  protected readonly selectId = `${this.uid}-select`;
  protected readonly hintId = `${this.uid}-hint`;
  protected readonly consentId = `${this.uid}-consent`;

  protected readonly readyEngines = computed(() =>
    this.llm.engines().filter((engine) => engine.status === 'ready'),
  );
  protected readonly blockedEngine = computed(
    () => this.llm.engines().find((engine) => engine.status === 'blocked') ?? null,
  );
  protected readonly noModels = computed(
    () => this.llm.detected() && !this.llm.detecting() && this.llm.models().length === 0,
  );
  protected readonly selectedEngine = computed(() => {
    const model = this.llm.selectedModel();
    return this.llm.engines().find((engine) => engine.id === model?.engineId) ?? null;
  });

  constructor() {
    if (!this.llm.detected()) {
      void this.llm.detect();
    }
  }

  protected detect(): void {
    void this.llm.detect();
  }

  protected onSelect(event: Event): void {
    this.llm.select((event.target as HTMLSelectElement).value || null);
  }

  protected onConsent(event: Event): void {
    this.llm.setAgentConsent((event.target as HTMLInputElement).checked);
  }

  protected groupLabel(engine: EngineDescriptor): string {
    return this.i18n.t('settings.model.group', {
      engine: engine.label,
      tier: this.i18n.t(
        engine.tier === 'local' ? 'settings.model.tierLocal' : 'settings.model.tierAgent',
      ),
    });
  }

  protected statusLabel(engine: EngineDescriptor): string {
    if (engine.status === 'ready' && engine.models.length === 1) {
      return this.i18n.t('settings.engines.readyOne');
    }
    return this.i18n.t(STATUS_KEYS[engine.status], { count: engine.models.length });
  }
}
