import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  PreferencesRepository,
  VACANCY_KEY,
} from './preferences.repository';

describe('PreferencesRepository', () => {
  let repository: PreferencesRepository;

  beforeEach(() => {
    localStorage.clear();
    repository = TestBed.inject(PreferencesRepository);
  });

  it('en el primer arranque devuelve los valores por defecto, sin consentimiento', () => {
    expect(repository.readPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.agentConsent).toBe(false);
  });

  it('guarda con clave con espacio de nombres y versión de esquema', () => {
    repository.writePreferences({ selectedModelId: 'ollama:x', agentConsent: true });

    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toEqual({
      schemaVersion: 1,
      selectedModelId: 'ollama:x',
      agentConsent: true,
    });
    expect(repository.readPreferences()).toEqual({
      selectedModelId: 'ollama:x',
      agentConsent: true,
    });
  });

  it('JSON corrupto o con tipos erróneos se descarta sin lanzar', () => {
    localStorage.setItem(PREFERENCES_KEY, '{nope');
    expect(repository.readPreferences()).toEqual(DEFAULT_PREFERENCES);

    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ schemaVersion: 1, selectedModelId: 3, agentConsent: 'sí' }),
    );
    expect(repository.readPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });

  it('el borrador de la vacante vacío borra la entrada', () => {
    repository.writeVacancy('Oferta');
    expect(repository.readVacancy()).toBe('Oferta');

    repository.writeVacancy('');
    expect(localStorage.getItem(VACANCY_KEY)).toBeNull();
    expect(repository.readVacancy()).toBe('');
  });
});
