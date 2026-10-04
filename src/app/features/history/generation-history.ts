import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import type { GenerationSummary } from '../../core/desktop/desktop-api';
import { I18n } from '../../core/i18n/i18n';
import type { MessageKey } from '../../core/i18n/messages';
import { WorkspaceService, type WorkspaceIssue } from '../../core/workspace/workspace.service';
import { scoreLevel, type ScoreLevel } from '../analysis/analysis.contract';
import { GenerationService } from '../generation/generation.service';

/** Versions listed before "Ver más": the list grows with every vacancy. */
export const HISTORY_VISIBLE = 5;

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
 *
 * It lives in the launcher (start screen and side panel), which listens to
 * `picked` to get out of the way before the version appears on the home page.
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

  /**
   * A version was read and is about to be shown. Emitted synchronously, before
   * `show()`, so a modal host can close first and the result can take focus.
   */
  readonly picked = output<void>();

  protected readonly expanded = signal(false);

  protected readonly visible = computed(() => {
    const all = this.workspace.generations();
    return this.expanded() ? all : all.slice(0, HISTORY_VISIBLE);
  });

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.workspace.generations().length - HISTORY_VISIBLE),
  );

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

  /** Splits after each separator, so a long path wraps between folders, never inside a name. */
  protected pathSegments(path: string): string[] {
    return path.split(/(?<=[\\/])/);
  }

  /** `…/Curriculae/ofertas` → `ofertas/`: the root is already shown in full above. */
  protected folderName(path: string): string {
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
    return `${name}/`;
  }

  protected scoreLevel(score: number): ScoreLevel {
    return scoreLevel(score);
  }

  protected async show(item: GenerationSummary): Promise<void> {
    const detail = await this.workspace.readGeneration(item.id);
    if (detail && !this.generation.busy()) {
      this.picked.emit();
      this.generation.show(detail);
    }
  }

  protected openFolder(item: GenerationSummary): void {
    void this.workspace.open({ kind: 'generation', id: item.id });
  }
}
