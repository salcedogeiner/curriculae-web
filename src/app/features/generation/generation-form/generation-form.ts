import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
} from '@angular/forms';
import { I18n } from '../../../core/i18n/i18n';
import type { MessageKey } from '../../../core/i18n/messages';
import { LlmService } from '../../../core/llm/llm.service';
import { CvImportService } from '../../cv/import/cv-import.service';
import { StepHeading } from '../../../shared/ui/step-heading/step-heading';
import { ModelSelector } from '../../settings/model-selector/model-selector';
import {
  VACANCY_MAX_CHARS,
  VACANCY_MIN_CHARS,
  VacancyService,
} from '../../vacancy/vacancy.service';
import { GenerationService } from '../generation.service';

const PHASE_KEYS: Partial<Record<string, MessageKey>> = {
  analysing: 'generation.phase.analysing',
  adapting: 'generation.phase.adapting',
  saving: 'generation.phase.saving',
  done: 'generation.phase.done',
};

/** Same rule as `VacancyService.isValid`, so form state and button never disagree. */
function trimmedMinLength(min: number) {
  return (control: AbstractControl<string>) => {
    const length = control.value.trim().length;
    return length > 0 && length < min ? { tooShort: true } : null;
  };
}

/**
 * The right-hand column of the home page: paste the vacancy, pick the model,
 * generate a new version of the CV — and, while it runs, the progress and the
 * cancel button in the same place, so the eye never has to look for them.
 *
 * The submit button is `aria-disabled`, not `disabled`: it stays in the tab
 * order and its accessible description says what is missing, instead of
 * silently vanishing for keyboard users.
 */
@Component({
  selector: 'app-generation-form',
  imports: [ReactiveFormsModule, ModelSelector, StepHeading],
  templateUrl: './generation-form.html',
  styleUrl: './generation-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationForm {
  protected readonly i18n = inject(I18n);
  protected readonly generation = inject(GenerationService);
  protected readonly vacancy = inject(VacancyService);
  private readonly llm = inject(LlmService);
  private readonly cvImport = inject(CvImportService);

  protected readonly form = inject(NonNullableFormBuilder).group({
    vacancy: [
      this.vacancy.text(),
      [trimmedMinLength(VACANCY_MIN_CHARS), Validators.maxLength(VACANCY_MAX_CHARS)],
    ],
  });

  protected readonly maxChars = VACANCY_MAX_CHARS;

  protected readonly vacancyError = computed(() => {
    const count = this.vacancy.charCount();
    if (count > VACANCY_MAX_CHARS) {
      return this.i18n.t('vacancy.errors.tooLong', { max: VACANCY_MAX_CHARS });
    }
    if (count > 0 && count < VACANCY_MIN_CHARS) {
      return this.i18n.t('vacancy.errors.tooShort', { min: VACANCY_MIN_CHARS });
    }
    return null;
  });

  /** The first thing missing before generating, in the order the page reads. */
  protected readonly blockReason = computed(() => {
    if (!this.cvImport.hasCv()) {
      return this.i18n.t('generation.needsCv');
    }
    if (!this.vacancy.isValid()) {
      return this.vacancyError() ?? this.i18n.t('generation.needsVacancy');
    }
    if (this.llm.selectedModel() === null) {
      return this.i18n.t('generation.needsModel');
    }
    if (this.llm.needsConsent()) {
      return this.i18n.t('generation.needsConsent');
    }
    return null;
  });

  protected readonly phaseLabel = computed(() => {
    const key = PHASE_KEYS[this.generation.phase()];
    return key ? this.i18n.t(key) : '';
  });

  protected readonly issueMessage = computed(() => {
    const issue = this.generation.issue();
    return issue ? this.i18n.t(issue.messageKey) : null;
  });

  constructor() {
    // The draft can also change from outside the form ("Crear nuevo espacio"
    // clears it); without this the textarea would keep showing the old text.
    effect(() => {
      const text = this.vacancy.text();
      const control = this.form.controls.vacancy;
      if (text !== control.value) {
        control.setValue(text, { emitEvent: false });
      }
    });
    this.form.controls.vacancy.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((text) => this.vacancy.setText(text));
  }

  protected submit(): void {
    if (this.blockReason() === null) {
      void this.generation.generate();
    }
  }

  protected cancel(): void {
    this.generation.cancel();
  }

  protected clear(): void {
    this.form.controls.vacancy.setValue('');
  }
}
