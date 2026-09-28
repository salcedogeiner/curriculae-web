import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CvParseError,
  hasReadableContent,
  isPdfSupported,
  normaliseCvText,
  parseCvFile,
  resetPdfjsCacheForTests,
} from './cv-parser';

const getDocument = vi.fn();
const extractRawText = vi.fn();

vi.mock('pdfjs-dist', () => ({ getDocument }));
// The real worker is a ~1 MB side-effect module; in the fake-worker setup it only
// assigns `globalThis.pdfjsWorker`, which is irrelevant here.
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs', () => ({}));
vi.mock('mammoth', () => ({ extractRawText }));

const MAX = 1024 * 1024;

describe('parseCvFile — validaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPdfjsCacheForTests();
  });

  it('rechaza un formato no admitido', async () => {
    const error = await expectParse(blob('cv.rtf', 'application/rtf'));
    expect(error.code).toBe('unsupported-format');
  });

  it('distingue el .doc antiguo para poder explicar cómo convertirlo', async () => {
    const error = await expectParse(blob('cv.doc', 'application/msword'));
    expect(error.code).toBe('legacy-word');
  });

  it('rechaza un archivo por encima del tamaño máximo', async () => {
    const oversized = new File(['x'.repeat(2048)], 'cv.pdf', { type: 'application/pdf' });
    const error = await expectParse(oversized, 1024);
    expect(error.code).toBe('too-large');
  });

  it('rechaza un archivo de texto vacío en lugar de producir un CV vacío', async () => {
    const error = await expectParse(new File(['   \n\n  '], 'cv.txt', { type: 'text/plain' }));
    expect(error.code).toBe('empty-file');
  });
});

describe('parseCvFile — TXT y Markdown', () => {
  beforeEach(() => {
    resetPdfjsCacheForTests();
  });

  it('normaliza a una única representación en texto plano', async () => {
    const parsed = await parseCvFile(
      blob('cv.txt', 'text/plain', 'Línea 1  \r\n\r\n\r\n\r\nLínea 2 con nbsp'),
      { maxBytes: MAX },
    );

    expect(parsed.format).toBe('text');
    expect(parsed.text).toBe('Línea 1\n\nLínea 2 con nbsp');
    expect(parsed.charCount).toBe(parsed.text.length);
  });

  it('conserva los encabezados Markdown como estructura', async () => {
    const parsed = await parseCvFile(
      blob('cv.md', 'text/markdown', '# Experiencia\n\n- Node 20\n'),
      { maxBytes: MAX },
    );

    expect(parsed.format).toBe('markdown');
    expect(parsed.text).toContain('# Experiencia');
    expect(parsed.text).toContain('- Node 20');
  });

  it('informa el avance por página sin llamar al progreso en TXT', async () => {
    const onProgress = vi.fn();
    await parseCvFile(blob('cv.txt', 'text/plain', 'hola'), { maxBytes: MAX, onProgress });
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('parseCvFile — PDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPdfjsCacheForTests();
    stubDomMatrix();
  });

  afterEach(() => {
    restoreDomMatrix();
  });

  it('reconstruye líneas y párrafos desde la posición vertical', async () => {
    mockPdf([
      page([
        item('Ana', 700),
        item('López', 700), // misma línea → un espacio
        item('Desarrolladora', 650), // salto grande → párrafo
        item('Node', 640), // salto de línea normal → solo un salto de línea
      ]),
    ]);

    const parsed = await parseCvFile(blob('cv.pdf', 'application/pdf'), { maxBytes: MAX });

    expect(parsed.format).toBe('pdf');
    expect(parsed.text).toBe('Ana López\n\nDesarrolladora\nNode');
  });

  it('detecta un PDF escaneado, que no tiene capa de texto', async () => {
    mockPdf([page([])]);

    const error = await expectParse(blob('escaneado.pdf', 'application/pdf'));

    expect(error.code).toBe('scanned-pdf');
  });

  it('informa el avance página a página y libera el documento', async () => {
    const { destroy } = mockPdf([page([item('Uno', 700)]), page([item('Dos', 700)])]);
    const onProgress = vi.fn();

    await parseCvFile(blob('cv.pdf', 'application/pdf'), { maxBytes: MAX, onProgress });

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(destroy).toHaveBeenCalled();
  });

  it('traduce un PDF corrupto a un error legible, no a una excepción cruda', async () => {
    getDocument.mockImplementation(() => {
      throw new Error('InvalidPDFException');
    });

    const error = await expectParse(blob('roto.pdf', 'application/pdf'));

    expect(error.code).toBe('corrupt-file');
  });

  it('libera el documento aunque una página falle', async () => {
    const { destroy } = mockPdf([]);
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () => Promise.reject(new Error('boom')),
      }),
      destroy,
    });

    await expectParse(blob('cv.pdf', 'application/pdf'));

    expect(destroy).toHaveBeenCalled();
  });
});

describe('isPdfSupported', () => {
  afterEach(() => {
    restoreDomMatrix();
  });

  it('es falso sin DOMMatrix, y el error no culpa al archivo', async () => {
    restoreDomMatrix();
    expect(isPdfSupported()).toBe(false);

    const error = await expectParse(blob('cv.pdf', 'application/pdf'));

    expect(error.code).toBe('pdf-unsupported');
    // Nunca llega a cargar pdf.js, que reventaría con ReferenceError.
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('es cierto con DOMMatrix, como en cualquier navegador', () => {
    stubDomMatrix();
    expect(isPdfSupported()).toBe(true);
  });
});

describe('parseCvFile — DOCX', () => {  beforeEach(() => {
    vi.clearAllMocks();
    resetPdfjsCacheForTests();
  });

  it('extrae el texto del documento', async () => {
    extractRawText.mockResolvedValue({ value: 'Ana López\r\n\r\nExperiencia\r\n' });

    const parsed = await parseCvFile(blob('cv.docx', DOCX_MIME), { maxBytes: MAX });

    expect(parsed.format).toBe('docx');
    expect(parsed.text).toBe('Ana López\n\nExperiencia');
  });

  it('traduce un DOCX protegido con contraseña a un error legible', async () => {
    extractRawText.mockRejectedValue(new Error('end of central directory not found'));

    const error = await expectParse(blob('cifrado.docx', DOCX_MIME));

    expect(error.code).toBe('corrupt-file');
  });
});

describe('normaliseCvText', () => {
  it('colapsa líneas en blanco, quita el final de línea y unifica los saltos', () => {
    expect(normaliseCvText('a  \r\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('conserva un salto simple dentro de un párrafo', () => {
    expect(normaliseCvText('uno\ndos')).toBe('uno\ndos');
  });
});

describe('hasReadableContent', () => {
  it('descarta el texto que solo es espacio en blanco', () => {
    expect(hasReadableContent('  \n\t ')).toBe(false);
    expect(hasReadableContent('a')).toBe(true);
  });
});

/* ── Helpers ──────────────────────────────────────────────────── */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function expectParse(file: File, maxBytes = MAX): Promise<CvParseError> {
  try {
    await parseCvFile(file, { maxBytes });
  } catch (error) {
    expect(error).toBeInstanceOf(CvParseError);
    return error as CvParseError;
  }
  throw new Error('Se esperaba un CvParseError y el archivo se aceptó.');
}

function blob(name: string, type: string, content = 'contenido'): File {
  return new File([content], name, { type });
}

function item(str: string, y: number): { str: string; transform: number[]; hasEOL: boolean } {
  return { str, transform: [1, 0, 0, 1, 0, y], hasEOL: false };
}

function page(items: unknown[]) {
  return { getTextContent: () => Promise.resolve({ items }), cleanup: vi.fn() };
}

function mockPdf(pages: unknown[]): { destroy: ReturnType<typeof vi.fn> } {
  const destroy = vi.fn(() => Promise.resolve());
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: (n: number) => Promise.resolve(pages[n - 1]),
    }),
    destroy,
  });
  return { destroy };
}

/**
 * jsdom has no `DOMMatrix`, which every browser has and `pdfjs-dist` needs. The
 * PDF specs stub it so the extraction logic is exercised; a separate spec proves
 * the parser degrades gracefully without it.
 */
function stubDomMatrix(): void {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class {
      constructor() {}
    } as unknown as typeof DOMMatrix;
  }
}

function restoreDomMatrix(): void {
  Reflect.deleteProperty(globalThis, 'DOMMatrix');
}
