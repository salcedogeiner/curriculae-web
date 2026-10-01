import { Injectable, computed, inject, signal } from '@angular/core';
import { PreferencesRepository } from '../../core/storage/preferences.repository';

/** Shorter than this is a job title, not a description the model can analyse. */
export const VACANCY_MIN_CHARS = 50;
/** Keeps CV + vacancy + prompt inside a local model's effective context. */
export const VACANCY_MAX_CHARS = 20_000;

/**
 * The vacancy text being worked on (step 2). It is a draft: kept on every
 * change and restored on reload, so a long paste survives an accidental
 * refresh. It is the user's input, not the user's CV, so `localStorage` under
 * its own versioned key is the right place (AGENTS.md §1.7).
 */
@Injectable({ providedIn: 'root' })
export class VacancyService {
  private readonly repository = inject(PreferencesRepository);

  private readonly _text = signal(this.repository.readVacancy());

  readonly text = this._text.asReadonly();
  readonly trimmed = computed(() => this._text().trim());
  readonly charCount = computed(() => this.trimmed().length);
  readonly isValid = computed(
    () => this.charCount() >= VACANCY_MIN_CHARS && this.charCount() <= VACANCY_MAX_CHARS,
  );

  setText(text: string): void {
    if (text === this._text()) {
      return;
    }
    this._text.set(text);
    this.repository.writeVacancy(text);
  }

  clear(): void {
    this.setText('');
  }
}
