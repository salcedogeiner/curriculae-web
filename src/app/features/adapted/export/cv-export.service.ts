import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { WorkspaceService } from '../../../core/workspace/workspace.service';
import { exportFileName, renderCvDocx, renderCvHtml, renderCvPlainText } from './cv-export-format';

export type ExportFormat = 'pdf' | 'docx' | 'md';

export type ExportOutcome =
  | { readonly kind: 'saved' | 'downloaded'; readonly fileName: string }
  | { readonly kind: 'copied' | 'failed' | 'copy-failed' };

/** What an export needs to know about the generation it comes from. */
export interface ExportSource {
  readonly adaptedCv: string;
  readonly jobTitle: string | null;
  readonly company: string | null;
  /** The generation folder id when the desktop app saved it. */
  readonly folderId: string | null;
}

const MIME: Readonly<Record<Exclude<ExportFormat, 'pdf'>, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown;charset=utf-8',
};

/**
 * Step 5. In the desktop app every export is written into the generation's own
 * folder next to `oferta.txt`, which is the point of the workspace; the PDF is
 * rendered by Electron itself, so it matches the HTML exactly. In the browser
 * the same payloads are downloaded, and the PDF goes through the print dialog
 * ("Guardar como PDF") from a script-free iframe.
 */
@Injectable({ providedIn: 'root' })
export class CvExportService {
  private readonly workspace = inject(WorkspaceService);
  private readonly document = inject(DOCUMENT);

  private readonly _busy = signal(false);
  private readonly _outcome = signal<ExportOutcome | null>(null);

  readonly busy = this._busy.asReadonly();
  readonly outcome = this._outcome.asReadonly();

  async export(source: ExportSource, format: ExportFormat): Promise<void> {
    if (this._busy()) {
      return;
    }
    this._busy.set(true);
    this._outcome.set(null);
    const fileName = exportFileName(source.adaptedCv, source.jobTitle, source.company, format);

    try {
      this._outcome.set(await this.#export(source, format, fileName));
    } catch {
      this._outcome.set({ kind: 'failed' });
    } finally {
      this._busy.set(false);
    }
  }

  async copy(source: ExportSource): Promise<void> {
    try {
      await navigator.clipboard.writeText(renderCvPlainText(source.adaptedCv));
      this._outcome.set({ kind: 'copied' });
    } catch {
      this._outcome.set({ kind: 'copy-failed' });
    }
  }

  reset(): void {
    this._outcome.set(null);
  }

  async #export(
    source: ExportSource,
    format: ExportFormat,
    fileName: string,
  ): Promise<ExportOutcome> {
    const folder = this.workspace.available ? source.folderId : null;

    if (format === 'pdf') {
      const html = renderCvHtml(source.adaptedCv);
      if (folder) {
        const saved = await this.workspace.exportPdf(folder, fileName, html);
        return saved ? { kind: 'saved', fileName: saved.fileName } : { kind: 'failed' };
      }
      this.#printHtml(html);
      return { kind: 'downloaded', fileName };
    }

    const bytes =
      format === 'docx'
        ? await renderCvDocx(source.adaptedCv)
        : new TextEncoder().encode(source.adaptedCv);

    if (folder) {
      const saved = await this.workspace.saveExport(folder, fileName, bytes);
      return saved ? { kind: 'saved', fileName: saved.fileName } : { kind: 'failed' };
    }
    this.#download(bytes, fileName, MIME[format]);
    return { kind: 'downloaded', fileName };
  }

  #download(bytes: Uint8Array, fileName: string, type: string): void {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Prints the standalone CV document, never the app around it. */
  #printHtml(html: string): void {
    const frame = this.document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-modals allow-same-origin');
    frame.className = 'visually-hidden';
    frame.srcdoc = html;
    frame.addEventListener('load', () => {
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    });
    this.document.body.appendChild(frame);
  }
}
