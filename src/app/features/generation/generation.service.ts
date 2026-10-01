import { Injectable, computed, inject, signal } from '@angular/core';
import type { GenerationDetail, GenerationSummary } from '../../core/desktop/desktop-api';
import type { MessageKey } from '../../core/i18n/messages';
import { LlmError, type LlmErrorCode, type ModelDescriptor } from '../../core/llm/engine.types';
import { extractJsonObject } from '../../core/llm/json-response';
import { LlmService } from '../../core/llm/llm.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import {
  ADAPTATION_TEMPERATURE,
  buildAdaptationMessages,
  cleanAdaptedCv,
} from '../adapted/adaptation.prompt';
import { findUnverifiedTerms } from '../adapted/fact-check';
import {
  ANALYSIS_JSON_SCHEMA,
  parseAnalysis,
  reviveAnalysis,
  type Analysis,
} from '../analysis/analysis.contract';
import { ANALYSIS_TEMPERATURE, buildAnalysisMessages } from '../analysis/analysis.prompt';
import { CvImportService } from '../cv/import/cv-import.service';
import { VacancyService } from '../vacancy/vacancy.service';

export type GenerationPhase = 'idle' | 'analysing' | 'adapting' | 'saving' | 'done' | 'error';

export interface GenerationResult {
  readonly analysis: Analysis;
  /** Markdown, as cleaned from the model answer. */
  readonly adaptedCv: string;
  /** Terms in the adapted CV that the base CV does not contain. */
  readonly unverified: readonly string[];
  readonly vacancyText: string;
  readonly baseCvFileName: string | null;
  readonly modelLabel: string | null;
  readonly createdAt: string;
  /** The generation folder, when the desktop app saved it. */
  readonly saved: GenerationSummary | null;
}

export interface GenerationIssue {
  readonly code: LlmErrorCode | 'unknown';
  readonly messageKey: MessageKey;
}

const ISSUE_KEYS: Readonly<Record<LlmErrorCode | 'unknown', MessageKey>> = {
  aborted: 'generation.errors.aborted',
  timeout: 'generation.errors.timeout',
  unreachable: 'generation.errors.unreachable',
  blocked: 'generation.errors.blocked',
  http: 'generation.errors.http',
  'engine-failed': 'generation.errors.engineFailed',
  'empty-response': 'generation.errors.emptyResponse',
  'malformed-json': 'generation.errors.malformedJson',
  'consent-required': 'generation.errors.consentRequired',
  unknown: 'generation.errors.unknown',
};

/**
 * Runs steps 3 and 4 of the flow (AGENTS.md §4) as one user action — "generar
 * una nueva versión de la hoja de vida" — and saves the outcome:
 *
 *   analyse (JSON, validated) → adapt (Markdown) → fact-check → save folder
 *
 * Two calls, one task each: a small local model asked for both at once does
 * one of them badly (cv-pipeline skill). Every call goes through `LlmService`,
 * so the privacy gate applies; every call takes the same `AbortController`, so
 * "Cancelar" stops the model, not just the spinner.
 */
@Injectable({ providedIn: 'root' })
export class GenerationService {
  private readonly llm = inject(LlmService);
  private readonly cvImport = inject(CvImportService);
  private readonly vacancy = inject(VacancyService);
  private readonly workspace = inject(WorkspaceService);

  private readonly _phase = signal<GenerationPhase>('idle');
  private readonly _result = signal<GenerationResult | null>(null);
  private readonly _issue = signal<GenerationIssue | null>(null);
  private readonly _receivedChars = signal(0);
  private readonly _thinking = signal(false);
  private readonly _draft = signal('');

  readonly phase = this._phase.asReadonly();
  readonly result = this._result.asReadonly();
  readonly issue = this._issue.asReadonly();
  /** Characters of answer streamed so far in the current step: proof of life. */
  readonly receivedChars = this._receivedChars.asReadonly();
  /** The model is emitting reasoning tokens, not answer tokens yet. */
  readonly thinking = this._thinking.asReadonly();
  /** The adapted CV as it streams in, for the live preview. */
  readonly draft = this._draft.asReadonly();

  readonly busy = computed(() => {
    const phase = this._phase();
    return phase === 'analysing' || phase === 'adapting' || phase === 'saving';
  });

  /** Everything the button needs before it can start. */
  readonly canStart = computed(
    () => this.cvImport.hasCv() && this.vacancy.isValid() && this.llm.ready() && !this.busy(),
  );

  private controller: AbortController | null = null;

  async generate(): Promise<void> {
    const cv = this.cvImport.cv();
    const model = this.llm.selectedModel();
    if (!this.canStart() || cv === null || model === null) {
      return;
    }

    const vacancyText = this.vacancy.trimmed();
    const controller = new AbortController();
    this.controller = controller;
    this._issue.set(null);
    this._draft.set('');

    try {
      this.#enter('analysing');
      const analysisAnswer = await this.llm.complete(
        {
          model,
          messages: buildAnalysisMessages(cv.text, vacancyText),
          temperature: ANALYSIS_TEMPERATURE,
          jsonSchema: ANALYSIS_JSON_SCHEMA,
        },
        {
          signal: controller.signal,
          onChunk: (chunk) => this.#onChunk(chunk.kind, chunk.text, false),
        },
      );
      const analysis = parseAnalysis(extractJsonObject(analysisAnswer), cv.text);

      this.#enter('adapting');
      const adaptedAnswer = await this.llm.complete(
        {
          model,
          messages: buildAdaptationMessages(cv.text, vacancyText, analysis),
          temperature: ADAPTATION_TEMPERATURE,
          // Rewriting within the facts is the hard task: without reasoning a
          // small model either copies the CV untouched or moves achievements
          // between jobs. Verified on qwen3.5 (2026-10-01).
          reason: true,
        },
        {
          signal: controller.signal,
          onChunk: (chunk) => this.#onChunk(chunk.kind, chunk.text, true),
        },
      );
      const adaptedCv = cleanAdaptedCv(adaptedAnswer);
      if (adaptedCv === '') {
        throw new LlmError('empty-response', 'La hoja de vida adaptada llegó vacía');
      }
      const unverified = findUnverifiedTerms(cv.text, adaptedCv, vacancyText);
      const modelLabel = this.#modelLabel(model);

      this.#enter('saving');
      const saved = await this.workspace.saveGeneration({
        jobTitle: analysis.jobTitle,
        company: analysis.company,
        vacancyText,
        adaptedCv,
        baseCvFileName: cv.fileName,
        modelId: model.id,
        modelLabel,
        analysis,
        unverified,
      });

      this._result.set({
        analysis,
        adaptedCv,
        unverified,
        vacancyText,
        baseCvFileName: cv.fileName,
        modelLabel,
        createdAt: saved?.createdAt ?? new Date().toISOString(),
        saved,
      });
      this._phase.set('done');
    } catch (error) {
      const code = error instanceof LlmError ? error.code : 'unknown';
      this._issue.set({ code, messageKey: ISSUE_KEYS[code] });
      // A cancel is the user's own decision, not a failure: back to idle, and
      // any previous result stays on screen untouched.
      this._phase.set(code === 'aborted' ? 'idle' : 'error');
    } finally {
      this.controller = null;
      this._thinking.set(false);
    }
  }

  cancel(): void {
    this.controller?.abort();
  }

  /** Shows a generation read back from its folder (history). */
  show(detail: GenerationDetail): boolean {
    const analysis = reviveAnalysis(detail.analysis);
    if (analysis === null || this.busy()) {
      return false;
    }
    this._result.set({
      analysis,
      adaptedCv: detail.adaptedCv,
      unverified: detail.unverified,
      vacancyText: detail.vacancyText,
      baseCvFileName: detail.baseCvFileName,
      modelLabel: detail.modelLabel,
      createdAt: detail.createdAt,
      saved: detail,
    });
    this._issue.set(null);
    this._phase.set('done');
    return true;
  }

  dismissIssue(): void {
    this._issue.set(null);
  }

  #enter(phase: GenerationPhase): void {
    this._phase.set(phase);
    this._receivedChars.set(0);
    this._thinking.set(false);
  }

  #onChunk(kind: 'content' | 'thinking', text: string, isDraft: boolean): void {
    if (kind === 'thinking') {
      this._thinking.set(true);
      return;
    }
    this._thinking.set(false);
    this._receivedChars.update((count) => count + text.length);
    if (isDraft) {
      this._draft.update((draft) => draft + text);
    }
  }

  #modelLabel(model: ModelDescriptor): string {
    const engine = this.llm.engines().find((candidate) => candidate.id === model.engineId);
    return engine ? `${model.label} · ${engine.label}` : model.label;
  }
}
