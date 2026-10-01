import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeLlmBackend } from '../../../../testing/fake-llm';
import { LLM_BACKEND } from '../../../core/llm/llm-backend';
import { VACANCY_KEY } from '../../../core/storage/preferences.repository';
import { CvImportService } from '../../cv/import/cv-import.service';
import { GenerationService } from '../generation.service';
import { GenerationForm } from './generation-form';

const VACANCY =
  'Globex busca desarrolladora Angular con experiencia en pruebas automatizadas y accesibilidad.';

describe('GenerationForm', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [GenerationForm],
      providers: [{ provide: LLM_BACKEND, useValue: new FakeLlmBackend() }],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(GenerationForm);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const type = async (text: string) => {
      const textarea = el.querySelector<HTMLTextAreaElement>('#vacancy-text')!;
      textarea.value = text;
      textarea.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    return { fixture, el, type };
  }

  it('el título del paso es un h2 y el textarea tiene su label', async () => {
    const { el } = await render();

    expect(el.querySelector('h2')?.textContent).toContain('La oferta de empleo');
    expect(el.querySelector('label[for="vacancy-text"]')?.textContent).toContain(
      'Texto de la oferta',
    );
  });

  it('contiene el selector de modelo y el botón de generar', async () => {
    const { el } = await render();

    expect(el.querySelector('app-model-selector')).not.toBeNull();
    expect(el.querySelector('.gen__submit')?.textContent).toContain(
      'Generar nueva versión de la hoja de vida',
    );
  });

  it('sin hoja de vida el botón sigue enfocable, aria-disabled, y dice qué falta', async () => {
    const { el } = await render();
    const button = el.querySelector<HTMLButtonElement>('.gen__submit')!;

    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-describedby')).toBe('generation-reason');
    expect(el.querySelector('#generation-reason')?.textContent).toContain(
      'Primero carga tu hoja de vida',
    );
  });

  it('pide más texto si la oferta es demasiado corta', async () => {
    await TestBed.inject(CvImportService).import(
      new File(['Ana'], 'cv.txt', { type: 'text/plain' }),
    );
    const { el, type } = await render();

    await type('Angular');

    expect(el.querySelector('#vacancy-error')?.textContent).toContain('al menos 50 caracteres');
    expect(el.querySelector('#vacancy-text')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('guarda el borrador de la oferta y lo restaura', async () => {
    const { type } = await render();
    await type(VACANCY);

    expect(JSON.parse(localStorage.getItem(VACANCY_KEY)!).text).toBe(VACANCY);

    const again = TestBed.createComponent(GenerationForm);
    await again.whenStable();
    expect(
      (again.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('#vacancy-text')
        ?.value,
    ).toBe(VACANCY);
  });

  it('el envío no hace nada mientras falte algo', async () => {
    const generate = vi.spyOn(TestBed.inject(GenerationService), 'generate');
    const { el } = await render();

    el.querySelector<HTMLButtonElement>('.gen__submit')!.click();

    expect(generate).not.toHaveBeenCalled();
  });

  it('borrar vacía el texto', async () => {
    const { el, type } = await render();
    await type(VACANCY);

    el.querySelector<HTMLButtonElement>('.gen__clear')!.click();
    await TestBed.inject(GenerationService).generate();

    expect(el.querySelector<HTMLTextAreaElement>('#vacancy-text')?.value).toBe('');
    expect(localStorage.getItem(VACANCY_KEY)).toBeNull();
  });

  it('anuncia las fases en una región viva presente desde el principio', async () => {
    const { el } = await render();
    expect(el.querySelector('[aria-live="polite"].visually-hidden')).not.toBeNull();
  });
});
