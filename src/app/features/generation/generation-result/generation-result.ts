import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { AdaptedPreview } from '../../adapted/adapted-preview/adapted-preview';
import { ExportActions } from '../../adapted/export-actions/export-actions';
import type { ExportSource } from '../../adapted/export/cv-export.service';
import { AnalysisReport } from '../../analysis/analysis-report/analysis-report';
import { GenerationService, type GenerationResult as Result } from '../generation.service';

/**
 * Step 3 + 4 on screen: the adapted CV as a document, the analysis beside it,
 * the export actions and the vacancy it was made for. While the rewrite
 * streams in, the same place shows it live, so a minute of waiting is a minute
 * of watching the CV being written rather than a spinner.
 *
 * When a new result lands, focus moves to its heading — it appears below the
 * fold, and a keyboard or screen reader user would otherwise never learn it
 * arrived (a11y-audit checklist §4).
 */
@Component({
  selector: 'app-generation-result',
  imports: [AdaptedPreview, AnalysisReport, ExportActions],
  templateUrl: './generation-result.html',
  styleUrl: './generation-result.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationResult {
  protected readonly i18n = inject(I18n);
  protected readonly generation = inject(GenerationService);

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly live = computed(
    () => this.generation.phase() === 'adapting' && this.generation.draft() !== '',
  );

  protected readonly exportSource = computed<ExportSource | null>(() => {
    const result = this.generation.result();
    return result
      ? {
          adaptedCv: result.adaptedCv,
          jobTitle: result.analysis.jobTitle,
          company: result.analysis.company,
          folderId: result.saved?.id ?? null,
        }
      : null;
  });

  protected readonly meta = computed(() => {
    const result = this.generation.result();
    if (!result) {
      return '';
    }
    return this.i18n.t('result.meta', {
      date: this.i18n.formatDate(result.createdAt),
      model: result.modelLabel ?? '—',
    });
  });

  protected readonly baseCvLabel = computed(() => {
    const fileName = this.generation.result()?.baseCvFileName;
    return fileName ? ` · ${this.i18n.t('result.baseCv', { fileName })}` : '';
  });

  private shown: Result | null = this.generation.result();

  constructor() {
    effect(() => {
      const result = this.generation.result();
      const heading = this.heading()?.nativeElement;
      if (result === null || result === this.shown || heading === undefined) {
        return;
      }
      this.shown = result;
      untracked(() => {
        heading.scrollIntoView({ block: 'start' });
        heading.focus();
      });
    });
  }
}
