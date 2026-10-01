import { Injectable, inject, signal } from '@angular/core';
import type {
  GenerationDetail,
  GenerationSummary,
  NewGeneration,
  SavedFile,
  WorkspaceInfo,
  WorkspaceTarget,
} from '../desktop/desktop-api';
import { DESKTOP_API } from '../desktop/desktop-bridge';

export type WorkspaceIssue = 'save-cv' | 'save-generation' | 'list' | 'read' | 'export' | 'open';

/**
 * The on-disk workspace the desktop app keeps for the user:
 *
 *   <raíz>/hojas-de-vida/       every base CV the user loaded, as the original file
 *   <raíz>/ofertas/<carpeta>/   one folder per tailored CV: oferta.txt,
 *                               hoja-de-vida-adaptada.md, analisis.json and exports
 *
 * Every method is a no-op in the browser (`available` is false), so features
 * call it unconditionally. A failed disk operation never breaks the flow that
 * triggered it — the generation is still on screen — it is reported through
 * `issue` instead.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly api = inject(DESKTOP_API)?.workspace ?? null;

  readonly available = this.api !== null;

  private readonly _info = signal<WorkspaceInfo | null>(null);
  private readonly _generations = signal<readonly GenerationSummary[]>([]);
  private readonly _issue = signal<WorkspaceIssue | null>(null);

  readonly info = this._info.asReadonly();
  readonly generations = this._generations.asReadonly();
  readonly issue = this._issue.asReadonly();

  async refresh(): Promise<void> {
    if (!this.api) {
      return;
    }
    await this.#attempt('list', async () => {
      this._info.set(await this.api!.info());
      this._generations.set(await this.api!.listGenerations());
    });
  }

  async chooseRoot(): Promise<void> {
    if (!this.api) {
      return;
    }
    await this.#attempt('open', async () => {
      const info = await this.api!.chooseRoot();
      if (info) {
        this._info.set(info);
        this._generations.set(await this.api!.listGenerations());
      }
    });
  }

  async open(target: WorkspaceTarget): Promise<void> {
    await this.#attempt('open', () => this.api?.open(target) ?? Promise.resolve());
  }

  /** Copies the uploaded base CV into `hojas-de-vida/`. */
  async saveCv(file: File): Promise<SavedFile | null> {
    if (!this.api) {
      return null;
    }
    return this.#attempt('save-cv', async () =>
      this.api!.saveCv(file.name, new Uint8Array(await file.arrayBuffer())),
    );
  }

  async saveGeneration(input: NewGeneration): Promise<GenerationSummary | null> {
    if (!this.api) {
      return null;
    }
    return this.#attempt('save-generation', async () => {
      const summary = await this.api!.saveGeneration(input);
      this._generations.update((list) => [summary, ...list.filter((g) => g.id !== summary.id)]);
      return summary;
    });
  }

  async readGeneration(id: string): Promise<GenerationDetail | null> {
    if (!this.api) {
      return null;
    }
    return this.#attempt('read', () => this.api!.readGeneration(id));
  }

  async saveExport(id: string, fileName: string, bytes: Uint8Array): Promise<SavedFile | null> {
    if (!this.api) {
      return null;
    }
    return this.#attempt('export', () => this.api!.saveExport(id, fileName, bytes));
  }

  async exportPdf(id: string, fileName: string, html: string): Promise<SavedFile | null> {
    if (!this.api) {
      return null;
    }
    return this.#attempt('export', () => this.api!.exportPdf(id, fileName, html));
  }

  clearIssue(): void {
    this._issue.set(null);
  }

  async #attempt<T>(issue: WorkspaceIssue, run: () => Promise<T>): Promise<T | null> {
    try {
      const result = await run();
      this._issue.set(null);
      return result;
    } catch {
      this._issue.set(issue);
      return null;
    }
  }
}
