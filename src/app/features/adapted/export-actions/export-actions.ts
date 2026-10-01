import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { WorkspaceService } from '../../../core/workspace/workspace.service';
import { CvExportService, type ExportFormat, type ExportSource } from '../export/cv-export.service';

/** The export buttons and their one-line outcome, announced politely. */
@Component({
  selector: 'app-export-actions',
  templateUrl: './export-actions.html',
  styleUrl: './export-actions.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportActions {
  readonly source = input.required<ExportSource>();

  protected readonly i18n = inject(I18n);
  protected readonly exporter = inject(CvExportService);
  protected readonly workspace = inject(WorkspaceService);

  protected readonly formats: readonly { id: ExportFormat; label: string }[] = [
    { id: 'pdf', label: this.i18n.t('export.pdf') },
    { id: 'docx', label: this.i18n.t('export.docx') },
    { id: 'md', label: this.i18n.t('export.markdown') },
  ];

  protected readonly message = computed(() => {
    if (this.exporter.busy()) {
      return this.i18n.t('export.working');
    }
    const outcome = this.exporter.outcome();
    switch (outcome?.kind) {
      case 'saved':
        return this.i18n.t('export.saved', { fileName: outcome.fileName });
      case 'downloaded':
        return this.i18n.t('export.downloaded', { fileName: outcome.fileName });
      case 'copied':
        return this.i18n.t('export.copied');
      case 'copy-failed':
        return this.i18n.t('export.copyFailed');
      case 'failed':
        return this.i18n.t('export.failed');
      default:
        return '';
    }
  });

  protected readonly failed = computed(() => {
    const kind = this.exporter.outcome()?.kind;
    return kind === 'failed' || kind === 'copy-failed';
  });

  protected run(format: ExportFormat): void {
    void this.exporter.export(this.source(), format);
  }

  protected copy(): void {
    void this.exporter.copy(this.source());
  }

  protected openFolder(id: string): void {
    void this.workspace.open({ kind: 'generation', id });
  }
}
