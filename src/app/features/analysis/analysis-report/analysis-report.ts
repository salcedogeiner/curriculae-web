import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import type { Analysis, RequirementImportance, RequirementVerdict } from '../analysis.contract';

const IMPORTANCE_ORDER: Readonly<Record<RequirementImportance, number>> = {
  must: 0,
  nice: 1,
  plus: 2,
};

/**
 * The gap report (step 3). Presentational: it receives a validated `Analysis`
 * and renders it through interpolation only — the summary, the requirement
 * texts and the evidence quotes all came from a model (AGENTS.md §8).
 */
@Component({
  selector: 'app-analysis-report',
  templateUrl: './analysis-report.html',
  styleUrl: './analysis-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisReport {
  readonly analysis = input.required<Analysis>();

  protected readonly i18n = inject(I18n);

  /** Must-haves first: that is the order a recruiter reads them in. */
  protected readonly requirements = computed(() =>
    [...this.analysis().requirements].sort(
      (a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance],
    ),
  );

  protected readonly scoreLevel = computed(() => {
    const score = this.analysis().score;
    return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  });

  protected verdictLabel(verdict: RequirementVerdict): string {
    return this.i18n.t(`analysis.verdict.${verdict}`);
  }

  protected importanceLabel(importance: RequirementImportance): string {
    return this.i18n.t(`analysis.importance.${importance}`);
  }
}
