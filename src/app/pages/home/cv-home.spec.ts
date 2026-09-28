import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CvHome } from './cv-home';
import { CvImportService } from '../../features/cv/import/cv-import.service';

describe('CvHome', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [CvHome] }).compileComponents();
  });

  it('muestra el area de arrastrar en la mitad izquierda', async () => {
    const fixture = TestBed.createComponent(CvHome);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-cv-dropzone')).not.toBeNull();
    expect(compiled.querySelector('.home')).not.toBeNull();
  });

  it('encabezado del paso en h2, por debajo del h1 del sitio', async () => {
    const fixture = TestBed.createComponent(CvHome);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h2')?.textContent).toContain('Tu hoja de vida');
    expect(compiled.querySelector('h1')).toBeNull();
  });

  it('promete que el CV no sale del equipo, en la propia pantalla', async () => {
    const fixture = TestBed.createComponent(CvHome);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('nunca se envía a ningún servidor');
  });

  it('restaura la hoja de vida guardada al entrar', async () => {
    const previous = TestBed.inject(CvImportService);
    await previous.import(new File(['# Perfil'], 'cv.md', { type: 'text/markdown' }));

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [CvHome] }).compileComponents();
    const fixture = TestBed.createComponent(CvHome);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('cv.md');
  });

  it('apila la vista previa encima de la zona y el resumen debajo', async () => {
    await TestBed.inject(CvImportService).import(
      new File(['Ana López\n\nEXPERIENCIA\nAcme'], 'cv.md', { type: 'text/markdown' }),
    );
    const fixture = TestBed.createComponent(CvHome);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    // Reading order is the contract: title → preview → zone → file summary.
    const nodes = [
      compiled.querySelector('.home__title'),
      compiled.querySelector('app-cv-preview'),
      compiled.querySelector('app-cv-dropzone'),
      compiled.querySelector('.dropzone__file'),
    ];
    expect(nodes.every((node) => node !== null)).toBe(true);

    for (let i = 0; i < nodes.length - 1; i++) {
      const follows = nodes[i]!.compareDocumentPosition(nodes[i + 1]!);
      expect(follows & Node.DOCUMENT_POSITION_FOLLOWING, `nodo ${i} antes que ${i + 1}`).toBeTruthy();
    }
  });

  it('muestra la vista previa con el texto extraído, sin interpretarlo como HTML', async () => {
    await TestBed.inject(CvImportService).import(
      new File(['<b>Ana</b>'], 'cv.md', { type: 'text/markdown' }),
    );
    const fixture = TestBed.createComponent(CvHome);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.preview__text')?.textContent).toBe('<b>Ana</b>');
    expect(compiled.querySelector('app-cv-preview b')).toBeNull();
  });

  it('no muestra la vista previa cuando todavía no hay archivo', async () => {
    const fixture = TestBed.createComponent(CvHome);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-cv-preview')).toBeNull();
    expect(compiled.querySelector('app-cv-dropzone')).not.toBeNull();
  });
});
