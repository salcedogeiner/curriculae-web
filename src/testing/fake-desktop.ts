import { vi } from 'vitest';
import type { DesktopApi, GenerationSummary } from '../app/core/desktop/desktop-api';
import { analysisAnswer } from './fake-llm';

/**
 * A desktop bridge with an in-memory workspace holding one past generation.
 * Specs only, like `fake-llm.ts`. The model side is left empty: provide
 * `LLM_BACKEND` with a `FakeLlmBackend` next to it.
 */

export const PAST_GENERATION: GenerationSummary = {
  id: '2026-10-01_0900-frontend-acme',
  path: '/home/ana/Curriculae/ofertas/2026-10-01_0900-frontend-acme',
  createdAt: '2026-10-01T14:00:00.000Z',
  jobTitle: 'Frontend',
  company: 'Acme',
  modelLabel: 'qwen3.5 · Ollama',
  score: 72,
};

export function fakeDesktop() {
  return {
    platform: 'linux',
    llm: {} as DesktopApi['llm'],
    workspace: {
      info: vi.fn(async () => ({
        root: '/home/ana/Curriculae',
        cvDir: '/home/ana/Curriculae/hojas-de-vida',
        offersDir: '/home/ana/Curriculae/ofertas',
      })),
      listGenerations: vi.fn(async () => [PAST_GENERATION]),
      readGeneration: vi.fn(async () => ({
        ...PAST_GENERATION,
        vacancyText: 'Oferta',
        adaptedCv: '# Ana',
        baseCvFileName: 'cv.pdf',
        modelId: 'ollama:qwen3.5:latest',
        analysis: JSON.parse(analysisAnswer('Angular')),
        unverified: [],
        files: [],
      })),
      open: vi.fn(async () => undefined),
      chooseRoot: vi.fn(async () => null),
    },
  };
}

export type FakeDesktop = ReturnType<typeof fakeDesktop>;
