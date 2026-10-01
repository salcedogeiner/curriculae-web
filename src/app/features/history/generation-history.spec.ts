import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisAnswer } from '../../../testing/fake-llm';
import type { DesktopApi, GenerationSummary } from '../../core/desktop/desktop-api';
import { DESKTOP_API } from '../../core/desktop/desktop-bridge';
import { GenerationService } from '../generation/generation.service';
import { GenerationHistory } from './generation-history';

const ITEM: GenerationSummary = {
  id: '2026-10-01_0900-frontend-acme',
  path: '/home/ana/Curriculae/ofertas/2026-10-01_0900-frontend-acme',
  createdAt: '2026-10-01T14:00:00.000Z',
  jobTitle: 'Frontend',
  company: 'Acme',
  modelLabel: 'qwen3.5 · Ollama',
  score: 72,
};

function fakeDesktop() {
  return {
    platform: 'linux',
    llm: {} as DesktopApi['llm'],
    workspace: {
      info: vi.fn(async () => ({
        root: '/home/ana/Curriculae',
        cvDir: '/home/ana/Curriculae/hojas-de-vida',
        offersDir: '/home/ana/Curriculae/ofertas',
      })),
      listGenerations: vi.fn(async () => [ITEM]),
      readGeneration: vi.fn(async () => ({
        ...ITEM,
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

describe('GenerationHistory', () => {
  beforeEach(() => localStorage.clear());

  async function render(desktop: ReturnType<typeof fakeDesktop> | null) {
    await TestBed.configureTestingModule({
      imports: [GenerationHistory],
      providers: [{ provide: DESKTOP_API, useValue: desktop }],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenerationHistory);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('no muestra nada en el navegador', async () => {
    const { el } = await render(null);
    expect(el.textContent?.trim()).toBe('');
  });

  it('muestra las carpetas de trabajo y las versiones generadas', async () => {
    const { el } = await render(fakeDesktop());

    expect(el.textContent).toContain('/home/ana/Curriculae/hojas-de-vida');
    expect(el.textContent).toContain('/home/ana/Curriculae/ofertas');
    expect(el.querySelector('.item__title')?.textContent).toBe('Frontend · Acme');
    expect(el.querySelector('.item__score')?.textContent).toContain('72 %');
  });

  it('"Ver" carga esa versión en la previsualización', async () => {
    const desktop = fakeDesktop();
    const { fixture, el } = await render(desktop);

    el.querySelector<HTMLButtonElement>('.item__actions button')!.click();
    await fixture.whenStable();
    await fixture.whenStable();

    expect(desktop.workspace.readGeneration).toHaveBeenCalledWith(ITEM.id);
    expect(TestBed.inject(GenerationService).result()?.adaptedCv).toBe('# Ana');
  });

  it('los botones repetidos tienen un nombre accesible propio', async () => {
    const { el } = await render(fakeDesktop());
    const labels = [...el.querySelectorAll('.item__actions button')].map((b) =>
      b.getAttribute('aria-label'),
    );

    expect(labels).toEqual([
      'Ver la versión para Frontend · Acme',
      'Abrir la carpeta de Frontend · Acme',
    ]);
  });

  it('abre la carpeta de una versión por su id, no por su ruta', async () => {
    const desktop = fakeDesktop();
    const { el } = await render(desktop);

    el.querySelectorAll<HTMLButtonElement>('.item__actions button')[1].click();

    expect(desktop.workspace.open).toHaveBeenCalledWith({ kind: 'generation', id: ITEM.id });
  });
});
