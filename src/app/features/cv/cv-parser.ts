import { detectCvFormat, isLegacyWordFile, type CvFormat } from './cv-file';

/**
 * Base-CV text extraction.
 *
 * The heavy parsers are `import()`ed on demand, which keeps them out of the
 * `initial` bundle and behind the production budget (angular.json: 500 kB warn /
 * 1 MB error) — `pdfjs-dist` alone is larger than the whole budget. Parsing lives
 * here, in one module, never inside a component (cv-pipeline skill, step 1).
 */

export type CvParseErrorCode =
  | 'unsupported-format'
  | 'legacy-word'
  | 'too-large'
  | 'empty-file'
  | 'scanned-pdf'
  | 'corrupt-file'
  | 'pdf-unsupported'
  | 'read-failed';

export class CvParseError extends Error {
  constructor(
    readonly code: CvParseErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CvParseError';
  }
}

export type ProgressReporter = (done: number, total: number) => void;

/** A CV that passed validation, with its text already normalised. */
export interface ParsedCv {
  readonly fileName: string;
  readonly format: CvFormat;
  readonly text: string;
  readonly charCount: number;
}

export async function parseCvFile(
  file: File,
  options: { maxBytes: number; onProgress?: ProgressReporter } ,
): Promise<ParsedCv> {
  const format = detectCvFormat(file);

  if (!format) {
    throw new CvParseError(
      isLegacyWordFile(file.name) ? 'legacy-word' : 'unsupported-format',
      `Formato no admitido: ${file.name} (${file.type || 'sin tipo MIME'})`,
    );
  }

  if (file.size > options.maxBytes) {
    throw new CvParseError('too-large', `${file.name} excede el tamaño máximo permitido`);
  }

  if (format === 'pdf' && !isPdfSupported()) {
    throw new CvParseError('pdf-unsupported', 'Este entorno no permite procesar PDF');
  }

  const raw = await extractText(file, format, options.onProgress);
  const text = normaliseCvText(raw);

  if (!hasReadableContent(text)) {
    // A PDF with no text layer is almost always a scan, and the fix is different
    // from an empty .txt — so it gets its own error (cv-pipeline skill, step 1).
    throw new CvParseError(
      format === 'pdf' ? 'scanned-pdf' : 'empty-file',
      `No se encontró texto legible en ${file.name}`,
    );
  }

  return { fileName: file.name, format, text, charCount: text.length };
}

/* ── Format handlers ──────────────────────────────────────────── */

async function extractText(
  file: File,
  format: CvFormat,
  onProgress?: ProgressReporter,
): Promise<string> {
  try {
    switch (format) {
      case 'pdf':
        return await extractPdfText(file, onProgress);
      case 'docx':
        return await extractDocxText(file);
      case 'markdown':
      case 'text':
        return await file.text();
    }
  } catch (error) {
    if (error instanceof CvParseError) {
      throw error;
    }
    // Password-protected and truncated ZIPs land here; both are "unreadable file".
    throw new CvParseError('corrupt-file', `No se pudo leer ${file.name}`, error);
  }
}

/**
 * `pdfjs-dist` builds a `DOMMatrix` while its module initialises, so on an engine
 * without it every PDF dies with a bare `ReferenceError` — which the generic
 * handler would then report as "the file is corrupt", sending the user down the
 * wrong path. Every browser has had `DOMMatrix` for years; this only guards odd
 * embeddings. It is also why the PDF path cannot be covered by the jsdom tests:
 * jsdom has no `DOMMatrix`.
 */
export function isPdfSupported(): boolean {
  return typeof DOMMatrix !== 'undefined';
}

async function extractPdfText(file: File, onProgress?: ProgressReporter): Promise<string> {
  const pdfjs = await loadPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });

  try {
    const doc = await task.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(textItemsToPlainText(content.items));
      page.cleanup();
      onProgress?.(pageNumber, doc.numPages);
    }

    return pages.join('\n\n');
  } finally {
    // Frees the worker-side buffers even when a page throws mid-loop.
    await task.destroy();
  }
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

/**
 * `pdfjs-dist` and its worker are one lazy chunk. The side-effect import of the
 * worker module is what makes it work with a bundler: it assigns
 * `globalThis.pdfjsWorker`, and pdf.js then detects the handler already present
 * and runs on the main thread instead of spawning a `Worker` from a URL — which
 * we would otherwise have to emit as an asset or fetch from a CDN.
 *
 * Pinned to 5.7.x on purpose: 6.x calls `Uint8Array.prototype.toHex` on every
 * load, a 2025 feature. It is fine in current browsers, but 5.x is the last
 * release that works on older engines, and this app runs on the user's own
 * machine. Revisit when the minimum browser target is decided.
 */
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    await import('pdfjs-dist/build/pdf.worker.min.mjs');
    return pdfjs;
  })();

  return pdfjsPromise;
}

/** Test seam: forgets the cached pdf.js module. */
export function resetPdfjsCacheForTests(): void {
  pdfjsPromise = null;
}

/* ── Text shaping ─────────────────────────────────────────────── */

/** Below this baseline distance two items are the same line; above it, a paragraph. */
const LINE_GAP_PT = 3;
const PARAGRAPH_GAP_PT = 14;

/**
 * pdf.js hands back positioned glyph runs, not lines. Rebuild the line and
 * paragraph structure from the vertical offset — a CV pasted back together
 * without line breaks is unreadable downstream.
 */
function textItemsToPlainText(items: readonly unknown[]): string {
  let out = '';
  let lastY: number | null = null;

  for (const candidate of items) {
    const item = candidate as { str?: unknown; transform?: unknown; hasEOL?: unknown };
    if (typeof item.str !== 'string') {
      continue;
    }

    if (out && !out.endsWith('\n')) {
      const y = verticalOffset(item.transform);
      const gap = lastY !== null && y !== null ? Math.abs(lastY - y) : 0;
      out += gap > PARAGRAPH_GAP_PT ? '\n\n' : gap > LINE_GAP_PT ? '\n' : ' ';
    }

    out += item.str;
    if (item.hasEOL === true) {
      out += '\n';
    }
    lastY = verticalOffset(item.transform);
  }

  return out;
}

function verticalOffset(transform: unknown): number | null {
  if (!Array.isArray(transform) || typeof transform[5] !== 'number') {
    return null;
  }
  return transform[5];
}

/**
 * One plain-text shape for all four sources (cv-pipeline skill, step 1). The
 * section split (contact / profile / experience / education / skills) is layered
 * on top of this, not inside it.
 */
export function normaliseCvText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasReadableContent(text: string): boolean {
  return text.replace(/\s/g, '').length > 0;
}
