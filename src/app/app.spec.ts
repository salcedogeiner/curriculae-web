import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeDesktop } from '../testing/fake-desktop';
import { FakeLlmBackend } from '../testing/fake-llm';
import { App } from './app';
import { DESKTOP_API } from './core/desktop/desktop-bridge';
import { LLM_BACKEND } from './core/llm/llm-backend';
import { GenerationService } from './features/generation/generation.service';
import { VacancyService } from './features/vacancy/vacancy.service';

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

  it('en el navegador no hay menú de espacios de trabajo', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.app-header__menu')).toBeNull();
    expect(compiled.querySelector('app-start-screen')).toBeNull();
    expect(compiled.querySelector('dialog')).toBeNull();
  });
});

describe('App en escritorio', () => {
  const VACANCY =
    'Globex busca desarrolladora Angular con experiencia en pruebas automatizadas y accesibilidad.';

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: DESKTOP_API, useValue: fakeDesktop() },
        { provide: LLM_BACKEND, useValue: new FakeLlmBackend() },
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const click = async (selector: string) => {
      el.querySelector<HTMLElement>(selector)!.click();
      await fixture.whenStable();
      await fixture.whenStable();
    };
    return { fixture, el, click };
  }

  function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
    return [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
  }

  it('abre en la pantalla de inicio, antes de cargar la página principal', async () => {
    const { el } = await render();

    expect(el.querySelector('app-start-screen')).not.toBeNull();
    expect(el.querySelector('router-outlet')).toBeNull();
    expect(el.querySelector('.app-header')).toBeNull();
    expect(el.querySelector('h1')?.textContent).toContain('Curriculae');
    expect(el.textContent).toContain('Crear nuevo espacio');
    // The workspace folder and the past versions, as on the old history section.
    expect(el.textContent).toContain('/home/ana/Curriculae');
    expect(el.textContent).toContain('Cambiar ubicación');
    expect(el.querySelector('.item__title')?.textContent).toBe('Frontend · Acme');
  });

  it('"Continuar" solo aparece si hay trabajo al que volver', async () => {
    const first = await render();
    expect(first.el.textContent).not.toContain('Continuar donde lo dejaste');

    TestBed.inject(VacancyService).setText(VACANCY);
    await first.fixture.whenStable();
    expect(first.el.textContent).toContain('Continuar donde lo dejaste');
  });

  it('"Crear nuevo espacio" entra a la página principal con la oferta vacía', async () => {
    TestBed.inject(VacancyService).setText(VACANCY);
    const { el, fixture } = await render();

    buttonByText(el, 'Crear nuevo espacio').click();
    await fixture.whenStable();

    expect(el.querySelector('app-start-screen')).toBeNull();
    expect(el.querySelector('.app-header')).not.toBeNull();
    expect(TestBed.inject(VacancyService).text()).toBe('');
    expect(document.activeElement).toBe(el.querySelector('main'));
  });

  it('abrir una versión anterior entra a la página principal con ella en pantalla', async () => {
    const { el, click } = await render();

    await click('.item__actions button');

    expect(el.querySelector('app-start-screen')).toBeNull();
    expect(TestBed.inject(GenerationService).result()?.adaptedCv).toBe('# Ana');
  });

  it('el menú de arriba a la izquierda abre el panel y "Volver" lo cierra', async () => {
    const { el, fixture, click } = await render();
    buttonByText(el, 'Crear nuevo espacio').click();
    await fixture.whenStable();

    const menu = el.querySelector<HTMLButtonElement>('.app-header__menu')!;
    const header = el.querySelector('.app-header__inner')!;
    expect(header.firstElementChild).toBe(menu);
    // The brand is its own block, centred apart from the menu, not glued to it.
    expect(menu.nextElementSibling?.classList).toContain('app-header__brand');
    expect(menu.nextElementSibling?.querySelector('h1')).not.toBeNull();
    expect(menu.getAttribute('aria-label')).toBe(
      'Abrir el inicio: espacio nuevo, carpeta de trabajo e historial',
    );
    expect(menu.getAttribute('aria-expanded')).toBe('false');

    await click('.app-header__menu');
    const dialog = el.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(dialog.textContent).toContain('Crear nuevo espacio');
    expect(dialog.textContent).not.toContain('Continuar donde lo dejaste');

    await click('.drawer__back');
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    // The home page was never torn down.
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });

  it('abrir una versión desde el panel lo cierra', async () => {
    const { el, fixture, click } = await render();
    buttonByText(el, 'Crear nuevo espacio').click();
    await fixture.whenStable();
    await click('.app-header__menu');

    await click('dialog .item__actions button');

    expect(el.querySelector('dialog')!.hasAttribute('open')).toBe(false);
    expect(TestBed.inject(GenerationService).result()?.adaptedCv).toBe('# Ana');
  });
});
