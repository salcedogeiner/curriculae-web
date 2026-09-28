import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';

/**
 * Read-only preview of the text extracted from the base CV.
 *
 * Presentational on purpose: it receives the text and does not know where it came
 * from. The text is the user's own file content, so it is rendered through
 * interpolation — never `innerHTML` (AGENTS.md §8: model and user text is
 * untrusted on re-render).
 */
@Component({
  selector: 'app-cv-preview',
  templateUrl: './cv-preview.html',
  styleUrl: './cv-preview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvPreview {
  readonly text = input.required<string>();
  readonly charCount = input.required<number>();
  readonly fileName = input.required<string>();

  protected readonly i18n = inject(I18n);

  /** Unique per instance so `aria-labelledby` stays correct with two previews. */
  protected readonly headingId = `cv-preview-${nextId++}`;
}

let nextId = 0;
