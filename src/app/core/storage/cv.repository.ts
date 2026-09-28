import { Injectable } from '@angular/core';
import type { CvFormat } from '../../features/cv/cv-file';
import { hasReadableContent, normaliseCvText } from '../text/cv-text';

/**
 * The base CV is the only sizeable thing this app persists, and it is the user's
 * own résumé: it must never leave the device (AGENTS.md §1.2), must be namespaced
 * and schema-versioned so a migration is possible later (AGENTS.md §1.7), and a
 * read must never throw — an older or hand-edited payload is discarded, not fatal
 * (AGENTS.md §8).
 */

export const STORAGE_KEY = 'curriculae:cv';
export const SCHEMA_VERSION = 1;

export interface StoredCv {
  readonly schemaVersion: number;
  readonly fileName: string;
  readonly format: CvFormat;
  readonly text: string;
  readonly charCount: number;
  readonly importedAt: string;
}

export function createStoredCv(input: {
  fileName: string;
  format: CvFormat;
  text: string;
  charCount: number;
}): StoredCv {
  return {
    schemaVersion: SCHEMA_VERSION,
    fileName: input.fileName,
    format: input.format,
    text: input.text,
    charCount: input.charCount,
    importedAt: new Date().toISOString(),
  };
}

@Injectable({ providedIn: 'root' })
export class CvRepository {
  read(): StoredCv | null {
    const raw = this.#safeGet();
    if (raw === null) {
      return null;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      this.clear();
      return null;
    }

    return isStoredCv(payload) ? payload : null;
  }

  write(cv: StoredCv): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cv));
    } catch {
      // Private mode / quota exhausted. The CV still lives in memory for this
      // session; losing the reload is better than losing the import.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to do */
    }
  }

  #safeGet(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}

function isStoredCv(value: unknown): value is StoredCv {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredCv>;

  if (candidate.schemaVersion !== SCHEMA_VERSION) {
    return false;
  }

  return (
    typeof candidate.fileName === 'string' &&
    typeof candidate.text === 'string' &&
    typeof candidate.importedAt === 'string' &&
    hasReadableContent(candidate.text) &&
    candidate.charCount === normaliseCvText(candidate.text).length
  );
}
