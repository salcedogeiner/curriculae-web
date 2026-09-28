import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Curriculae');
  });

  it('coloca el titulo del sitio en la cabecera, arriba del contenido', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const header = compiled.querySelector('header');
    const h1 = compiled.querySelector('h1');

    expect(header).not.toBeNull();
    expect(header?.contains(h1)).toBe(true);
    // h1 precedes the routed content in the DOM.
    expect(h1?.compareDocumentPosition(compiled.querySelector('main')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('expone el punto de salto como primer elemento enfocable', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const skip = compiled.querySelector<HTMLAnchorElement>('.skip-link');
    expect(skip?.getAttribute('href')).toBe('#main');
    expect(compiled.querySelector('main')?.id).toBe('main');
  });
});
