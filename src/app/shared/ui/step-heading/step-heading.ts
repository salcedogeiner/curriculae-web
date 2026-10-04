import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';

/**
 * The heading of a step of the flow: a numbered badge, the `h2` and an
 * optional lead. Presentational only. The badge is decorative; screen readers
 * hear the step number from a visually hidden prefix inside the heading.
 *
 * The `h2` takes focus by script (`focus()`), so a step that appears
 * asynchronously — the result — can be announced (a11y-audit checklist §4).
 */
@Component({
  selector: 'app-step-heading',
  templateUrl: './step-heading.html',
  styleUrl: './step-heading.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepHeading {
  protected readonly i18n = inject(I18n);

  readonly step = input.required<number>();
  readonly title = input.required<string>();
  readonly headingId = input.required<string>();
  readonly lead = input<string | null>(null);

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  focus(): void {
    const heading = this.heading().nativeElement;
    heading.scrollIntoView({ block: 'start' });
    heading.focus();
  }
}
