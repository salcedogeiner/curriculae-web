import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PAST_GENERATION as ITEM,
  fakeDesktop,
  type FakeDesktop,
} from '../../../testing/fake-desktop';
import { DESKTOP_API } from '../../core/desktop/desktop-bridge';
import { GenerationService } from '../generation/generation.service';
import { GenerationHistory } from './generation-history';

describe('GenerationHistory', () => {
  beforeEach(() => localStorage.clear());

  async function render(desktop: FakeDesktop | null) {
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

    // The root in full; the subfolders by name, their full path on hover.
    expect(el.querySelector('.root__path')?.textContent?.replace(/\s/g, '')).toBe(
      '/home/ana/Curriculae',
    );
    const folders = [...el.querySelectorAll('.paths code')];
    expect(folders.map((f) => f.textContent)).toEqual(['hojas-de-vida/', 'ofertas/']);
    expect(folders.map((f) => f.getAttribute('title'))).toEqual([
      '/home/ana/Curriculae/hojas-de-vida',
      '/home/ana/Curriculae/ofertas',
    ]);
    expect(el.querySelector('.item__title')?.textContent).toBe('Frontend · Acme');
    expect(el.querySelector('.item__score')?.textContent).toContain('72 %');
  });

  it('muestra 5 versiones y el resto detrás de "Ver más"', async () => {
    const desktop = fakeDesktop();
    desktop.workspace.listGenerations.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({ ...ITEM, id: `v${i}`, jobTitle: `Oferta ${i}` })),
    );
    const { fixture, el } = await render(desktop);
    const more = () => el.querySelector<HTMLButtonElement>('.list__more');

    expect(el.querySelectorAll('.item')).toHaveLength(5);
    expect(el.querySelector('.card__count')?.textContent).toBe('7');
    expect(more()?.textContent).toContain('Ver 2 más');
    expect(more()?.getAttribute('aria-expanded')).toBe('false');
    expect(more()?.getAttribute('aria-controls')).toBe('history-list');

    more()!.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.item')).toHaveLength(7);
    expect(more()?.textContent).toContain('Ver menos');
    expect(more()?.getAttribute('aria-expanded')).toBe('true');

    more()!.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.item')).toHaveLength(5);
  });

  it('sin "Ver más" cuando caben todas', async () => {
    const { el } = await render(fakeDesktop());

    expect(el.querySelector('.list__more')).toBeNull();
  });

  it('la carpeta de trabajo va antes que la lista, que puede crecer', async () => {
    const { el } = await render(fakeDesktop());
    const [first, second] = el.querySelectorAll('.card');

    expect(first.getAttribute('aria-labelledby')).toBe('workspace-title');
    expect(second.getAttribute('aria-labelledby')).toBe('history-title');
  });

  it('cambiar la ubicación es un botón, no un enlace suelto', async () => {
    const desktop = fakeDesktop();
    const { el } = await render(desktop);
    const change = [...el.querySelectorAll<HTMLButtonElement>('.card__actions button')].find((b) =>
      b.textContent?.includes('Cambiar ubicación'),
    )!;

    expect(change.classList).toContain('btn');
    expect(change.classList).not.toContain('btn--ghost');
    change.click();
    expect(desktop.workspace.chooseRoot).toHaveBeenCalled();
  });

  it('la compatibilidad lleva número y palabra, no solo color', async () => {
    const { el } = await render(fakeDesktop());
    const score = el.querySelector('.item__score')!;

    expect(score.textContent).toContain('compatibilidad');
    expect(score.getAttribute('data-level')).toBe('high');
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

  it('avisa con "picked" antes de mostrar la versión, para que el lanzador se cierre', async () => {
    const { fixture, el } = await render(fakeDesktop());
    const generation = TestBed.inject(GenerationService);
    const seen: (string | undefined)[] = [];
    fixture.componentInstance.picked.subscribe(() => seen.push(generation.result()?.adaptedCv));

    el.querySelector<HTMLButtonElement>('.item__actions button')!.click();
    await fixture.whenStable();
    await fixture.whenStable();

    // Emitted once, while the previous result (none) was still on screen.
    expect(seen).toEqual([undefined]);
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
