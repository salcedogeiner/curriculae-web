/**
 * Accepted base-CV formats and file validation.
 *
 * The extension is checked BEFORE the MIME type: browsers disagree on what a
 * `.md` file reports (`text/markdown` in Chrome, `text/plain` in Firefox), and
 * both are valid, so the extension is the more reliable signal. MIME is only a
 * fallback for files dragged from an app that reports a useful type and a
 * meaningless name.
 */

export type CvFormat = 'pdf' | 'docx' | 'markdown' | 'text';

export interface CvFormatSpec {
  readonly id: CvFormat;
  /** Human label, also used in the `accept` hint and in status messages. */
  readonly label: string;
  readonly extensions: readonly string[];
  readonly mimes: readonly string[];
}

export const CV_FORMATS: Readonly<Record<CvFormat, CvFormatSpec>> = {
  pdf: {
    id: 'pdf',
    label: 'PDF',
    extensions: ['pdf'],
    mimes: ['application/pdf', 'application/x-pdf'],
  },
  docx: {
    id: 'docx',
    label: 'DOCX',
    extensions: ['docx'],
    mimes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
    ],
  },
  markdown: {
    id: 'markdown',
    label: 'Markdown',
    extensions: ['md', 'markdown', 'mdown', 'mkd'],
    mimes: ['text/markdown', 'text/x-markdown'],
  },
  text: {
    id: 'text',
    label: 'TXT',
    extensions: ['txt', 'text'],
    mimes: ['text/plain'],
  },
};

/** Old Word 97-2003. Rejected with a specific message so the user knows what to do. */
export const LEGACY_DOC_EXTENSION = 'doc';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Value for the `<input type="file" accept>` attribute. */
export const CV_ACCEPT_ATTRIBUTE = [
  ...new Set(
    Object.values(CV_FORMATS).flatMap((spec) => [
      ...spec.extensions.map((ext) => `.${ext}`),
      ...spec.mimes,
    ]),
  ),
].join(',');

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

export function isLegacyWordFile(fileName: string): boolean {
  return extensionOf(fileName) === LEGACY_DOC_EXTENSION;
}

/** Returns the matching format, or `null` when the file is not a supported CV. */
export function detectCvFormat(file: Pick<File, 'name' | 'type'>): CvFormat | null {
  const extension = extensionOf(file.name);

  for (const spec of Object.values(CV_FORMATS)) {
    if (spec.extensions.includes(extension)) {
      return spec.id;
    }
  }

  const mime = file.type.toLowerCase();
  for (const spec of Object.values(CV_FORMATS)) {
    if (mime && spec.mimes.includes(mime)) {
      return spec.id;
    }
  }

  return null;
}

export function formatLabel(format: CvFormat): string {
  return CV_FORMATS[format].label;
}

export function formatListLabel(): string {
  return Object.values(CV_FORMATS)
    .map((spec) => spec.label)
    .join(', ');
}

/** 1_234_567 → "1,2 MB". Spanish decimal comma, no locale dependency. */
export function humanFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1).replace('.', ',')} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
