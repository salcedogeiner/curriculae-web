import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_MODEL,
  CLAUDE_ENGINE,
  FakeLlmBackend,
  OLLAMA_ENGINE,
  analysisAnswer,
} from '../../../testing/fake-llm';
import type {
  DesktopApi,
  GenerationDetail,
  GenerationSummary,
} from '../../core/desktop/desktop-api';
import { DESKTOP_API } from '../../core/desktop/desktop-bridge';
import { LlmError } from '../../core/llm/engine.types';
import { LLM_BACKEND } from '../../core/llm/llm-backend';
import { LlmService } from '../../core/llm/llm.service';
import { CvImportService } from '../cv/import/cv-import.service';
import { VacancyService } from '../vacancy/vacancy.service';
import { GenerationService } from './generation.service';

const CV_TEXT = '# Ana López\n\nMigré la aplicación a Angular 17 en Acme.';
const VACANCY =
  'Globex busca desarrolladora Angular con experiencia en Kubernetes y pruebas automatizadas.';
const ADAPTED = '# Ana López\n\n## Experiencia\n- Migré la aplicación a Angular 17 en Acme.';

const SUMMARY: GenerationSummary = {
  id: '2026-10-01_0900-desarrolladora-angular-acme',
  path: '/tmp/ofertas/2026-10-01_0900-desarrolladora-angular-acme',
  createdAt: '2026-10-01T14:00:00.000Z',
  jobTitle: 'Desarrolladora Angular',
  company: 'Acme',
  modelLabel: 'qwen3.5 · Ollama',
  score: 100,
};

describe('GenerationService', () => {
  let backend: FakeLlmBackend;

  beforeEach(() => {
    localStorage.clear();
    backend = new FakeLlmBackend();
  });

  async function setup(desktop: DesktopApi | null = null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: LLM_BACKEND, useValue: backend },
        { provide: DESKTOP_API, useValue: desktop },
      ],
    });
    await TestBed.inject(CvImportService).import(
      new File([CV_TEXT], 'cv.md', { type: 'text/markdown' }),
    );
    TestBed.inject(VacancyService).setText(VACANCY);
    await TestBed.inject(LlmService).detect();
    return TestBed.inject(GenerationService);
  }

  it('no arranca sin hoja de vida, vacante y modelo', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: LLM_BACKEND, useValue: backend }] });
    const generation = TestBed.inject(GenerationService);

    expect(generation.canStart()).toBe(false);
    await generation.generate();
    expect(backend.requests).toHaveLength(0);
  });

  it('analiza con esquema JSON, adapta y deja el resultado validado', async () => {
    backend.respond(analysisAnswer('Migré la aplicación a Angular 17'), ADAPTED);
    const generation = await setup();

    await generation.generate();

    expect(generation.phase()).toBe('done');
    const [analysisCall, adaptCall] = backend.requests;
    expect(analysisCall.jsonSchema).toBeDefined();
    expect(analysisCall.temperature).toBeLessThan(adaptCall.temperature);
    expect(adaptCall.jsonSchema).toBeUndefined();

    const result = generation.result()!;
    expect(result.analysis.score).toBe(60);
    expect(result.analysis.gaps).toEqual(['Kubernetes']);
    expect(result.adaptedCv).toBe(ADAPTED);
    expect(result.unverified).toEqual([]);
    expect(result.vacancyText).toBe(VACANCY);
    expect(result.saved).toBeNull();
  });

  it('marca lo que la versión adaptada añade y el CV no tenía', async () => {
    backend.respond(
      analysisAnswer('Migré la aplicación a Angular 17'),
      `${ADAPTED}\n- Desplegué en Kubernetes.`,
    );
    const generation = await setup();

    await generation.generate();

    expect(generation.result()?.unverified).toContain('Kubernetes');
  });

  it('un análisis que no es JSON termina en un error con su mensaje, sin segunda llamada', async () => {
    backend.respond('Lo siento, no puedo.');
    const generation = await setup();

    await generation.generate();

    expect(generation.phase()).toBe('error');
    expect(generation.issue()).toEqual({
      code: 'malformed-json',
      messageKey: 'generation.errors.malformedJson',
    });
    expect(backend.requests).toHaveLength(1);
  });

  it('cancelar vuelve a idle y conserva el resultado anterior', async () => {
    backend.respond(analysisAnswer('Migré la aplicación a Angular 17'), ADAPTED);
    const generation = await setup();
    await generation.generate();
    const previous = generation.result();

    backend.respond(
      (_request, options) =>
        new Promise<string>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new LlmError('aborted', 'cancelada')),
          );
        }),
    );
    const running = generation.generate();
    expect(generation.busy()).toBe(true);
    generation.cancel();
    await running;

    expect(generation.phase()).toBe('idle');
    expect(generation.result()).toBe(previous);
  });

  it('muestra el borrador mientras se redacta', async () => {
    let draftDuringAdapt = '';
    backend.respond(analysisAnswer('Migré la aplicación a Angular 17'), (_request, options) => {
      options.onChunk?.({ kind: 'content', text: '# Ana' });
      draftDuringAdapt = TestBed.inject(GenerationService).draft();
      return '# Ana López';
    });
    const generation = await setup();

    await generation.generate();

    expect(draftDuringAdapt).toBe('# Ana');
  });

  it('un agente sin consentimiento no puede empezar', async () => {
    backend.engines = [OLLAMA_ENGINE, CLAUDE_ENGINE];
    const generation = await setup();
    TestBed.inject(LlmService).select(AGENT_MODEL.id);

    expect(generation.canStart()).toBe(false);
  });

  it('en escritorio guarda la carpeta de la oferta con la vacante y la hoja de vida', async () => {
    const saveGeneration = vi.fn(async () => SUMMARY);
    const desktop = {
      workspace: { saveGeneration, saveCv: vi.fn(async () => ({ path: '', fileName: '' })) },
    };
    backend.respond(analysisAnswer('Migré la aplicación a Angular 17'), ADAPTED);
    const generation = await setup(desktop as unknown as DesktopApi);

    await generation.generate();

    expect(saveGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        vacancyText: VACANCY,
        adaptedCv: ADAPTED,
        baseCvFileName: 'cv.md',
        jobTitle: 'Desarrolladora Angular',
        company: 'Acme',
        modelLabel: 'qwen3.5 · Ollama',
      }),
    );
    expect(generation.result()?.saved).toEqual(SUMMARY);
    expect(generation.result()?.createdAt).toBe(SUMMARY.createdAt);
  });

  it('muestra una generación del historial y rechaza una manipulada', async () => {
    const generation = await setup();
    const detail: GenerationDetail = {
      ...SUMMARY,
      vacancyText: VACANCY,
      adaptedCv: ADAPTED,
      baseCvFileName: 'cv.md',
      modelId: 'ollama:qwen3.5:latest',
      analysis: JSON.parse(analysisAnswer('Angular 17')),
      unverified: [],
      files: [],
    };

    expect(generation.show(detail)).toBe(true);
    expect(generation.result()?.saved?.id).toBe(SUMMARY.id);
    expect(generation.show({ ...detail, analysis: { requirements: 'x' } })).toBe(false);
  });
});
