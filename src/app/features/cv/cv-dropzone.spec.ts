import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CvDropzone } from './cv-dropzone';
import { CvImportService } from './cv-import.service';
import { CV_ACCEPT_ATTRIBUTE } from './cv-file';

describe('CvDropzone', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [CvDropzone] }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(CvDropzone);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('expone un input de archivo real con los formatos admitidos', async () => {
    const { el } = await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]');

    expect(input).not.toBeNull();
    expect(input?.getAttribute('accept')).toBe(CV_ACCEPT_ATTRIBUTE);
  });

  it('asocia el label al input, que es su nombre accesible', async () => {
    const { el } = await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]');
    const label = el.querySelector<HTMLLabelElement>('label');

    expect(label?.getAttribute('for')).toBe(input?.id);
    expect(label?.textContent?.trim()).toBe('Cargar la hoja de vida base');
  });

  it('describe los formatos y el tamaño máximo en español', async () => {
    const { el } = await render();
    const hint = el.querySelector('.dropzone__hint');

    expect(hint?.textContent).toContain('Formatos admitidos: PDF, DOCX, Markdown, TXT');
    expect(hint?.textContent).toContain('8,0 MB');
  });

  it('conecta el input con su pista mediante aria-describedby', async () => {
    const { el } = await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]');
    const hint = el.querySelector('.dropzone__hint');

    expect(input?.getAttribute('aria-describedby')).toBe(hint?.id);
  });

  it('importa el archivo elegido con el selector nativo', async () => {
    const { fixture, el } = await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;

    attachFiles(input, [new File(['# Experiencia'], 'cv.md', { type: 'text/markdown' })]);
    input.dispatchEvent(new Event('change'));

    await fixture.whenStable();
    await fixture.whenStable();

    expect(TestBed.inject(CvImportService).fileName()).toBe('cv.md');
  });

  it('muestra el resumen del archivo DEBAJO de la zona, no dentro', async () => {
    await TestBed.inject(CvImportService).import(
      new File(['x'.repeat(25_000)], 'cv.md', { type: 'text/markdown' }),
    );
    const { el } = await render();

    const zone = el.querySelector('.dropzone')!;
    const summary = el.querySelector('.dropzone__file')!;
    const summaryText = summary.textContent ?? '';

    expect(summaryText).toContain('Hoja de vida cargada: cv.md');
    expect(summaryText).toContain('25.000'); // punto de miles es-ES, no 25,000
    expect(summaryText).toContain('Markdown'); // la etiqueta, no "MARKDOWN"

    // The summary is a sibling that comes after the zone, and the zone itself
    // keeps saying "drop it here" so a replacement can be dragged straight on.
    expect(zone.contains(summary)).toBe(false);
    expect(zone.compareDocumentPosition(summary)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(zone.textContent).toContain('Arrastra tu hoja de vida aquí');
  });

  it('sigue invitar a soltar otro archivo aunque ya haya uno cargado', async () => {
    await TestBed.inject(CvImportService).import(new File(['a'], 'cv.txt', { type: 'text/plain' }));
    const { el } = await render();

    const zone = el.querySelector('.dropzone')!;
    expect(zone.textContent).toContain('Arrastra tu hoja de vida aquí');
    expect(zone.classList.contains('dropzone--loaded')).toBe(true);

    const input = zone.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.disabled).toBe(false);
  });

  it('anuncia el error con role="alert" y en texto, no solo con color', async () => {
    await TestBed.inject(CvImportService).import(new File(['x'], 'cv.rtf', { type: 'application/rtf' }));
    const { el } = await render();

    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('no es un formato admitido');
  });

  it('expone una región aria-live para el progreso y la carga correcta', async () => {
    const { el } = await render();

    const live = el.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.getAttribute('aria-hidden')).toBeNull();
  });

  it('da ids distintos a cada instancia, para que for y aria-describedby no se pisen', async () => {
    const first = await render();
    const second = await render();

    const idOf = (el: HTMLElement) => el.querySelector('input[type="file"]')?.id;
    expect(idOf(first.el)).toBeTruthy();
    expect(idOf(first.el)).not.toBe(idOf(second.el));
  });

  it('marca los iconos decorativos como aria-hidden', async () => {
    const { el } = await render();

    const icons = el.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.getAttribute('focusable')).toBe('false');
    }
  });

  it('usa type="button" para que el botón no envíe nada por accidente', async () => {
    await TestBed.inject(CvImportService).import(new File(['x'], 'cv.rtf', { type: 'application/rtf' }));
    const { el } = await render();

    const retry = el.querySelector<HTMLButtonElement>('.dropzone-error__retry');
    expect(retry?.type).toBe('button');
    expect(retry?.textContent?.trim()).toBeTruthy();
  });

  it('resetea el valor del input para poder volver a elegir el mismo archivo', async () => {
    const { fixture, el } = await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;

    attachFiles(input, [new File(['a'], 'cv.txt', { type: 'text/plain' })]);
    input.dispatchEvent(new Event('change'));

    await fixture.whenStable();
    await fixture.whenStable();

    expect(input.value).toBe('');
  });
});

describe('CvDropzone — arrastrar y soltar', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [CvDropzone] }).compileComponents();
  });

  async function renderZone(): Promise<{ fixture: ComponentFixture<CvDropzone>; zone: HTMLElement }> {
    const fixture = TestBed.createComponent(CvDropzone);
    await fixture.whenStable();
    return { fixture, zone: (fixture.nativeElement as HTMLElement).querySelector('.dropzone')! };
  }

  it('reactiva la zona al entrar con un archivo', async () => {
    const { fixture, zone } = await renderZone();

    expect(zone.classList.contains('dropzone--active')).toBe(false);

    fireDrop(zone, 'dragenter', [textFile()]);
    await fixture.whenStable();
    expect(zone.classList.contains('dropzone--active')).toBe(true);

    fireDrop(zone, 'dragleave', [textFile()]);
    await fixture.whenStable();
    expect(zone.classList.contains('dropzone--active')).toBe(false);
  });

  it('mantiene la zona activa al moverse entre hijos, sin parpadear', async () => {
    const { fixture, zone } = await renderZone();

    // dragenter fires for the child elements too; only a matching leave deactivates.
    fireDrop(zone, 'dragenter', [textFile()]);
    fireDrop(zone, 'dragenter', [textFile()]);
    fireDrop(zone, 'dragleave', [textFile()]);
    await fixture.whenStable();

    expect(zone.classList.contains('dropzone--active')).toBe(true);

    fireDrop(zone, 'dragleave', [textFile()]);
    await fixture.whenStable();

    expect(zone.classList.contains('dropzone--active')).toBe(false);
  });

  it('no se activa al arrastrar texto que no es un archivo', async () => {
    const { fixture, zone } = await renderZone();

    fireDrop(zone, 'dragenter', []);
    await fixture.whenStable();

    expect(zone.classList.contains('dropzone--active')).toBe(false);
  });

  it('importa el archivo soltado', async () => {
    const { fixture, zone } = await renderZone();

    fireDrop(zone, 'dragenter', [textFile('soltado.txt')]);
    fireDrop(zone, 'dragover', [textFile('soltado.txt')]);
    fireDrop(zone, 'drop', [textFile('soltado.txt')]);

    await fixture.whenStable();
    await fixture.whenStable();

    expect(TestBed.inject(CvImportService).fileName()).toBe('soltado.txt');
    expect(zone.classList.contains('dropzone--active')).toBe(false);
  });

  it('evita que el navegador abra el archivo si se suelta fuera de la zona', async () => {
    await renderZone();

    const outside = fireDrop(window, 'drop', [textFile()]);

    expect(outside.defaultPrevented).toBe(true);
  });

  it('deja de interceptar sueltas cuando el componente se destruye', async () => {
    const { fixture } = await renderZone();
    fixture.destroy();

    const outside = fireDrop(window, 'drop', [textFile()]);

    expect(outside.defaultPrevented).toBe(false);
  });
});

function textFile(name = 'cv.txt'): File {
  return new File(['texto'], name, { type: 'text/plain' });
}

/**
 * jsdom implements neither `DragEvent` nor `DataTransfer`, so both are stubbed:
 * the component only ever reads `dataTransfer.types` and `dataTransfer.files[0]`.
 */
function fileList(files: File[]): FileList {
  return Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList;
}

function attachFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, 'files', { value: fileList(files), configurable: true });
}

function fireDrop(target: EventTarget, type: string, files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: files.length > 0 ? ['Files'] : ['text/plain'], files: fileList(files) },
  });
  target.dispatchEvent(event);
  return event;
}
