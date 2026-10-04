import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StepHeading } from './step-heading';

describe('StepHeading', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StepHeading] }).compileComponents();
  });

  async function render(lead: string | null = 'Pega la oferta.') {
    const fixture = TestBed.createComponent(StepHeading);
    fixture.componentRef.setInput('step', 2);
    fixture.componentRef.setInput('title', 'La oferta de empleo');
    fixture.componentRef.setInput('headingId', 'vacancy-step-title');
    fixture.componentRef.setInput('lead', lead);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('el número se ve como insignia y se anuncia dentro del h2', async () => {
    const { el } = await render();
    const h2 = el.querySelector('h2')!;

    expect(el.querySelector('.step__number')?.getAttribute('aria-hidden')).toBe('true');
    expect(h2.id).toBe('vacancy-step-title');
    expect(h2.textContent?.replace(/\s+/g, ' ').trim()).toBe('Paso 2: La oferta de empleo');
    expect(el.querySelector('.step__lead')?.textContent).toBe('Pega la oferta.');
  });

  it('sin texto de apoyo no deja un párrafo vacío', async () => {
    const { el } = await render(null);

    expect(el.querySelector('.step__lead')).toBeNull();
  });

  it('focus() lleva el foco al encabezado, para anunciar un paso que acaba de aparecer', async () => {
    const { fixture, el } = await render();
    document.body.append(el);
    const h2 = el.querySelector('h2')!;
    // jsdom has no layout, so no scrollIntoView.
    h2.scrollIntoView = vi.fn();

    fixture.componentInstance.focus();

    expect(h2.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(document.activeElement).toBe(h2);
    el.remove();
  });
});
