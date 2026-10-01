import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { GenerationSummary } from '../../core/desktop/desktop-api';
import { I18n } from '../../core/i18n/i18n';
import type { MessageKey } from '../../core/i18n/messages';
import { WorkspaceService, type WorkspaceIssue } from '../../core/workspace/workspace.service';
import { GenerationService } from '../generation/generation.service';

const ISSUE_KEYS: Readonly<Record<WorkspaceIssue, MessageKey>> = {
  'save-cv': 'workspace.errors.saveCv',
  'save-generation': 'workspace.errors.saveGeneration',
  list: 'workspace.errors.list',
  read: 'workspace.errors.read',
  export: 'workspace.errors.export',
  open: 'workspace.errors.open',
};

/**
 * Desktop only: where things are saved on disk, and every CV generated so far,
 * one per vacancy folder, each one previewable again with a click. Renders
 * nothing in the browser, where there is no workspace.
 */
@Component({
  selector: 'app-generation-history',
  templateUrl: './generation-history.html',
  styleUrl: './generation-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationHistory {
  protected readonly i18n = inject(I18n);
  protected readonly workspace = inject(WorkspaceService);
  private readonly generation = inject(GenerationService);

  protected readonly currentId = computed(() => this.generation.result()?.saved?.id ?? null);

  protected readonly issueMessage = computed(() => {
    const issue = this.workspace.issue();
    return issue ? this.i18n.t(ISSUE_KEYS[issue]) : null;
  });

  constructor() {
    void this.workspace.refresh();
  }

  protected title(item: GenerationSummary): string {
    const parts = [item.jobTitle, item.company].filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join(' · ') : this.i18n.t('history.untitled');
  }

  protected async show(item: GenerationSummary): Promise<void> {
    const detail = await this.workspace.readGeneration(item.id);
    if (detail) {
      this.generation.show(detail);
    }
  }

  protected openFolder(item: GenerationSummary): void {
    void this.workspace.open({ kind: 'generation', id: item.id });
  }
}
