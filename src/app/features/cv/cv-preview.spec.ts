import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CvPreview } from './cv-preview';

describe('CvPreview', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CvPreview] }).compileComponents();
  });

  function render(props: { text: string; charCount?: number; fileName?: string }) {
    const fixture = TestBed.createComponent(CvPreview);
    fixture.componentRef.setInput('text', props.text);
    fixture.componentRef.setInput('charCount', props.charCount ?? props.text.length);
    fixture.componentRef.setInput('fileName', props.fileName ?? 'cv.pdf');
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra el texto extraído tal cual', async () => {
    const { fixture, el } = render({ text: 'Ana López\n\nEXPERIENCIA\nAcme' });
    await fixture.whenStable();

    expect(el.querySelector('.preview__text')?.textContent).toBe('Ana López\n\nEXPERIENCIA\nAcme');
  });

  it('conserva los saltos de línea del CV, en vez de colapsarlos', async () => {
    const { fixture, el } = render({ text: 'uno\n\ndos' });
    await fixture.whenStable();

    expect(el.querySelector('pre')?.textContent).toContain('uno\n\ndos');
  });

  it('resume el origen y el tamaño en español', async () => {
    const { fixture, el } = render({ text: 'x'.repeat(25_000), fileName: 'cv.md' });
    await fixture.whenStable();

    const meta = el.querySelector('.preview__meta')?.textContent ?? '';
    expect(meta).toContain('cv.md');
    expect(meta).toContain('25.000');
  });

  it('nunca interpreta el texto como HTML', async () => {
    const { fixture, el } = render({
      text: '<img src=x onerror="alert(1)"> <b>negrita</b>',
    });
    await fixture.whenStable();

    // The markup arrives as literal characters, not as elements.
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('.preview__text')?.textContent).toContain('<img src=x');
  });

  it('es una región con nombre y enfocable, para poder desplazarla con teclado', async () => {
    const { fixture, el } = render({ text: 'mucho texto '.repeat(500) });
    await fixture.whenStable();

    const body = el.querySelector('.preview__body')!;
    // A scrollable box that is not focusable cannot be scrolled from the keyboard.
    expect(body.getAttribute('tabindex')).toBe('0');
    expect(body.getAttribute('role')).toBe('group');
    expect(body.getAttribute('aria-label')).toBe('Texto extraído de la hoja de vida');
  });

  it('es un h3, por debajo del h2 del paso, sin saltarse niveles', async () => {
    const { fixture, el } = render({ text: 'x' });
    await fixture.whenStable();

    const heading = el.querySelector('h3')!;
    const section = el.querySelector('section')!;
    expect(heading.id).not.toBe('');
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
  });

  it('da un id propio a cada instancia', async () => {
    const first = render({ text: 'a' });
    const second = render({ text: 'b' });
    await first.fixture.whenStable();
    await second.fixture.whenStable();

    const idOf = (el: HTMLElement) => el.querySelector('h3')?.id;
    expect(idOf(first.el)).toBeTruthy();
    expect(idOf(first.el)).not.toBe(idOf(second.el));
  });
});
