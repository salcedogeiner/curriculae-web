import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeDesktop } from '../../../testing/fake-desktop';
import { FakeLlmBackend } from '../../../testing/fake-llm';
import { DESKTOP_API } from '../../core/desktop/desktop-bridge';
import { LLM_BACKEND } from '../../core/llm/llm-backend';
import { GenerationService } from '../generation/generation.service';
import { VacancyService } from '../vacancy/vacancy.service';
import { LauncherService } from './launcher.service';

const VACANCY =
  'Globex busca desarrolladora Angular con experiencia en pruebas automatizadas y accesibilidad.';

describe('LauncherService', () => {
  beforeEach(() => localStorage.clear());

  function setup(desktop: ReturnType<typeof fakeDesktop> | null, extra: unknown[] = []) {
    TestBed.configureTestingModule({
      providers: [
        { provide: DESKTOP_API, useValue: desktop },
        { provide: LLM_BACKEND, useValue: new FakeLlmBackend() },
        ...(extra as never[]),
      ],
    });
    return TestBed.inject(LauncherService);
  }

  it('en el navegador no hay lanzador: la página principal es toda la app', () => {
    const launcher = setup(null);

    expect(launcher.available).toBe(false);
    expect(launcher.view()).toBe('closed');
    launcher.openDrawer();
    expect(launcher.drawerOpen()).toBe(false);
  });

  it('en escritorio arranca en la pantalla de inicio', () => {
    const launcher = setup(fakeDesktop());

    expect(launcher.startup()).toBe(true);
  });

  it('el menú solo abre el panel una vez fuera de la pantalla de inicio', () => {
    const launcher = setup(fakeDesktop());

    launcher.openDrawer();
    expect(launcher.view()).toBe('start');

    launcher.close();
    launcher.openDrawer();
    expect(launcher.drawerOpen()).toBe(true);

    launcher.close();
    expect(launcher.view()).toBe('closed');
  });

  it('un espacio nuevo borra la oferta y el resultado, y conserva la hoja de vida', async () => {
    const launcher = setup(fakeDesktop());
    const vacancy = TestBed.inject(VacancyService);
    const generation = TestBed.inject(GenerationService);
    vacancy.setText(VACANCY);
    const detail = await TestBed.inject(DESKTOP_API)!.workspace.readGeneration('x');
    generation.show(detail);
    expect(launcher.canResume()).toBe(true);

    expect(launcher.startNew()).toBe(true);

    expect(vacancy.text()).toBe('');
    expect(generation.result()).toBeNull();
    expect(launcher.canResume()).toBe(false);
    // Closing is the host's job, so a modal can close synchronously.
    expect(launcher.startup()).toBe(true);
  });

  it('no crea un espacio nuevo mientras una generación sigue en curso', () => {
    const launcher = setup(fakeDesktop(), [
      {
        provide: GenerationService,
        useValue: { reset: () => false, busy: signal(true), result: signal(null) },
      },
    ]);
    const vacancy = TestBed.inject(VacancyService);
    vacancy.setText(VACANCY);

    expect(launcher.canStartNew()).toBe(false);
    expect(launcher.startNew()).toBe(false);
    expect(vacancy.text()).toBe(VACANCY);
  });
});
