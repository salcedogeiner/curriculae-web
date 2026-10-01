import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdaptedPreview } from './adapted-preview';

describe('AdaptedPreview', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AdaptedPreview] }).compileComponents();
  });

  async function render(markdown: string, unverified: string[] = [], live = false) {
    const fixture = TestBed.createComponent(AdaptedPreview);
    fixture.componentRef.setInput('markdown', markdown);
    fixture.componentRef.setInput('unverified', unverified);
    fixture.componentRef.setInput('live', live);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('renderiza el CV como documento: nombre, secciones, viñetas y negrita', async () => {
    const el = await render('# Ana López\n\n## Experiencia\n- Migré a **Angular**');

    expect(el.querySelector('.cv__name')?.textContent).toBe('Ana López');
    expect(el.querySelector('.cv__section')?.textContent).toBe('Experiencia');
    expect(el.querySelector('.cv__list li strong')?.textContent).toBe('Angular');
  });

  it('no mete espacios entre segmentos que van pegados', async () => {
    const el = await render('- Experta en **Angular**, RxJS');
    expect(el.querySelector('.cv__list li')?.textContent).toBe('Experta en Angular, RxJS');
  });

  it('marca los términos no verificados dentro del texto y los lista arriba', async () => {
    const el = await render('# Ana\n- Desplegué con Kubernetes', ['Kubernetes']);

    expect(el.querySelector('.check__term')?.textContent).toBe('Kubernetes');
    const mark = el.querySelector('mark.cv__flag');
    expect(mark?.textContent).toContain('Kubernetes');
    expect(mark?.textContent).toContain('no verificado');
  });

  it('dice que todo está verificado cuando no hay nada que revisar', async () => {
    const el = await render('# Ana');
    expect(el.querySelector('.check--ok')).not.toBeNull();
  });

  it('nunca interpreta el texto del modelo como HTML', async () => {
    const el = await render('# <img src=x onerror="alert(1)">\n- <script>alert(1)</script>');

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('.cv__name')?.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it('en vivo no muestra la verificación, que aún no tiene sentido', async () => {
    const el = await render('# Ana', ['Ana'], true);

    expect(el.querySelector('.check')).toBeNull();
    expect(el.querySelector('mark')).toBeNull();
    expect(el.querySelector('.cv')?.getAttribute('aria-busy')).toBe('true');
  });
});
