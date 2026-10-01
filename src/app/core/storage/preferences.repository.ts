import { Injectable } from '@angular/core';
import { VersionedStore } from './versioned-store';

export const PREFERENCES_KEY = 'curriculae:preferences';
export const VACANCY_KEY = 'curriculae:vacancy';

export interface Preferences {
  readonly selectedModelId: string | null;
  /**
   * Consent to send the CV through an `agent` engine. Stored apart from the
   * model choice on purpose (llm-integration skill): revoking it is one click
   * and never loses the selection, and picking another model never grants it.
   */
  readonly agentConsent: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { selectedModelId: null, agentConsent: false };

export interface StoredVacancy {
  readonly text: string;
}

@Injectable({ providedIn: 'root' })
export class PreferencesRepository {
  private readonly preferences = new VersionedStore<Preferences>(
    PREFERENCES_KEY,
    1,
    (value) =>
      (value['selectedModelId'] === null || typeof value['selectedModelId'] === 'string') &&
      typeof value['agentConsent'] === 'boolean',
  );

  private readonly vacancy = new VersionedStore<StoredVacancy>(
    VACANCY_KEY,
    1,
    (value) => typeof value['text'] === 'string',
  );

  readPreferences(): Preferences {
    return this.preferences.read() ?? DEFAULT_PREFERENCES;
  }

  writePreferences(preferences: Preferences): void {
    this.preferences.write(preferences);
  }

  readVacancy(): string {
    return this.vacancy.read()?.text ?? '';
  }

  writeVacancy(text: string): void {
    if (text === '') {
      this.vacancy.clear();
    } else {
      this.vacancy.write({ text });
    }
  }
}
