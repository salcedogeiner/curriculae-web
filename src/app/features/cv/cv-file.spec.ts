import { describe, expect, it } from 'vitest';
import {
  CV_ACCEPT_ATTRIBUTE,
  detectCvFormat,
  formatListLabel,
  humanFileSize,
  isLegacyWordFile,
} from './cv-file';

describe('detectCvFormat', () => {
  it('accepts the four documented sources', () => {
    expect(detectCvFormat(file('cv.pdf'))).toBe('pdf');
    expect(detectCvFormat(file('cv.docx'))).toBe('docx');
    expect(detectCvFormat(file('cv.md'))).toBe('markdown');
    expect(detectCvFormat(file('cv.txt'))).toBe('text');
  });

  it('is case-insensitive and tolerates multiple dots', () => {
    expect(detectCvFormat(file('CV Final.PDF'))).toBe('pdf');
    expect(detectCvFormat(file('Mi.Curriculum.v2.docx'))).toBe('docx');
  });

  it('trusts the extension over the MIME type, because browsers disagree on .md', () => {
    // Chrome reports text/markdown, Firefox reports text/plain for the same file.
    expect(detectCvFormat(file('cv.md', 'text/plain'))).toBe('markdown');
    expect(detectCvFormat(file('cv.txt', 'text/markdown'))).toBe('text');
  });

  it('falls back to the MIME type when the name has no extension', () => {
    expect(detectCvFormat(file('descarga', 'application/pdf'))).toBe('pdf');
  });

  it('rejects anything else', () => {
    expect(detectCvFormat(file('cv.rtf', 'application/rtf'))).toBeNull();
    expect(detectCvFormat(file('cv.exe', ''))).toBeNull();
    expect(detectCvFormat(file('cv', ''))).toBeNull();
  });

  it('flags the legacy .doc format separately from "unsupported"', () => {
    expect(isLegacyWordFile('cv.doc')).toBe(true);
    expect(isLegacyWordFile('cv.docx')).toBe(false);
  });
});

describe('accept attribute', () => {
  it('lists every extension and MIME type of every supported format', () => {
    expect(CV_ACCEPT_ATTRIBUTE).toContain('.pdf');
    expect(CV_ACCEPT_ATTRIBUTE).toContain('.docx');
    expect(CV_ACCEPT_ATTRIBUTE).toContain('.md');
    expect(CV_ACCEPT_ATTRIBUTE).toContain('.txt');
    expect(CV_ACCEPT_ATTRIBUTE).toContain('application/pdf');
    // The OS picker must not offer Word 97-2003.
    expect(CV_ACCEPT_ATTRIBUTE).not.toContain('.doc,');
  });

  it('has a Spanish, human-readable format list for the hint', () => {
    expect(formatListLabel()).toBe('PDF, DOCX, Markdown, TXT');
  });
});

describe('humanFileSize', () => {
  it('uses the Spanish decimal comma and never reports 0 KB', () => {
    expect(humanFileSize(2 * 1024 * 1024)).toBe('2,0 MB');
    expect(humanFileSize(1024)).toBe('1 KB');
    expect(humanFileSize(400)).toBe('1 KB');
  });
});

function file(name: string, type = ''): File {
  return new File(['contenido'], name, { type });
}
