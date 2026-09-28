import { Injectable, computed, inject, signal } from '@angular/core';
import { CvRepository, createStoredCv, type StoredCv } from '../../../core/storage/cv.repository';
import type { MessageKey } from '../../../core/i18n/messages';
import { MAX_FILE_BYTES, humanFileSize } from '../cv-file';
import { CvParseError, parseCvFile, type CvParseErrorCode } from './cv-parser';

export type CvImportStatus = 'idle' | 'reading' | 'ready' | 'error';

/** A failure already reduced to what the UI needs: a key and its parameters. */
export interface CvImportIssue {
  readonly code: CvParseErrorCode;
  readonly messageKey: MessageKey;
  readonly params: Readonly<Record<string, string | number>>;
}

const ISSUE_KEYS: Readonly<Record<CvParseErrorCode, MessageKey>> = {
  'unsupported-format': 'cv.errors.unsupportedFormat',
  'legacy-word': 'cv.errors.oldWordFormat',
  'too-large': 'cv.errors.tooLarge',
  'empty-file': 'cv.errors.emptyFile',
  'scanned-pdf': 'cv.errors.scannedPdf',
  'corrupt-file': 'cv.errors.corruptFile',
  'pdf-unsupported': 'cv.errors.pdfUnsupported',
  'read-failed': 'cv.errors.readFailed',
};

/**
 * Owns the base-CV state: validate → parse → normalise → persist.
 *
 * One import at a time. A second file dropped while the first is being parsed is
 * ignored rather than queued, because the user dropping twice almost always
 * means the first one was a mistake (AGENTS.md §8: a frozen screen is a bug).
 */
@Injectable({ providedIn: 'root' })
export class CvImportService {
  readonly maxBytes = MAX_FILE_BYTES;

  private readonly repository = inject(CvRepository);

  private readonly _status = signal<CvImportStatus>('idle');
  private readonly _cv = signal<StoredCv | null>(null);
  private readonly _issue = signal<CvImportIssue | null>(null);
  private readonly _pendingFileName = signal<string | null>(null);
  private readonly _pageProgress = signal<{ done: number; total: number } | null>(null);

  readonly status = this._status.asReadonly();
  readonly cv = this._cv.asReadonly();
  readonly issue = this._issue.asReadonly();
  readonly pendingFileName = this._pendingFileName.asReadonly();
  readonly pageProgress = this._pageProgress.asReadonly();

  readonly isBusy = computed(() => this._status() === 'reading');
  readonly hasCv = computed(() => this._cv() !== null);
  readonly fileName = computed(() => this._cv()?.fileName ?? null);
  readonly format = computed(() => this._cv()?.format ?? null);

  /** Rehydrates the previous session. Safe on a first run and on stale data. */
  restore(): void {
    const stored = this.repository.read();
    if (stored) {
      this._cv.set(stored);
      this._status.set('ready');
    }
  }

  async import(file: File): Promise<void> {
    if (this.isBusy()) {
      return;
    }

    this._status.set('reading');
    this._issue.set(null);
    this._pendingFileName.set(file.name);
    this._pageProgress.set(null);

    try {
      const parsed = await parseCvFile(file, {
        maxBytes: this.maxBytes,
        onProgress: (done, total) => this._pageProgress.set({ done, total }),
      });

      const stored = createStoredCv(parsed);
      this.repository.write(stored);
      this._cv.set(stored);
      this._status.set('ready');
    } catch (error) {
      this._status.set('error');
      this._issue.set(toIssue(error, file));
    } finally {
      this._pendingFileName.set(null);
      this._pageProgress.set(null);
    }
  }

  /** Clears the error and returns the zone to its idle state, keeping any CV. */
  clearIssue(): void {
    this._issue.set(null);
    this._status.update((current) => (current === 'error' && !this.hasCv() ? 'idle' : current));
  }

  forget(): void {
    this.repository.clear();
    this._cv.set(null);
    this._issue.set(null);
    this._status.set('idle');
  }
}

function toIssue(error: unknown, file: File): CvImportIssue {
  if (error instanceof CvParseError) {
    return {
      code: error.code,
      messageKey: ISSUE_KEYS[error.code],
      params: { fileName: file.name, size: humanFileSize(file.size), maxSize: humanFileSize(MAX_FILE_BYTES) },
    };
  }

  return {
    code: 'read-failed',
    messageKey: ISSUE_KEYS['read-failed'],
    params: { fileName: file.name },
  };
}

/** `{"fileName": "cv.pdf", "done": 2, "total": 5}` → "cv.pdf · 2/5", while a single-page
 *  PDF gets no counter, because "1/1" is noise rather than progress. */
export function describeProgress(
  fileName: string | null,
  pageProgress: { done: number; total: number } | null,
): string | null {
  if (fileName === null) {
    return null;
  }
  if (pageProgress !== null && pageProgress.total > 1) {
    return `${fileName} · ${pageProgress.done}/${pageProgress.total}`;
  }
  return fileName;
}
