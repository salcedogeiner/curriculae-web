import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { parseMarkdownBlocks, type InlineText } from '../../../core/text/markdown-blocks';
import { splitByTerms } from '../fact-check';

/** An inline run, further split so unverified terms can be marked. */
interface PreviewSegment {
  readonly text: string;
  readonly strong: boolean;
  readonly emphasis: boolean;
  readonly flagged: boolean;
}

type PreviewLine = readonly PreviewSegment[];

type PreviewBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly line: PreviewLine }
  | { readonly kind: 'paragraph'; readonly lines: readonly PreviewLine[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly PreviewLine[] }
  | { readonly kind: 'rule' };

/**
 * The adapted CV as a document (step 4), and enforcement layer 3 of the
 * no-invented-facts rule: every term the fact-check could not find in the base
 * CV is listed above the document and marked inside it, before any export.
 *
 * The Markdown is parsed to data and rendered through templates; nothing from
 * the model reaches `innerHTML` (AGENTS.md §8). The same component shows the
 * answer while it streams in (`live`), when there is nothing to check yet.
 */
@Component({
  selector: 'app-adapted-preview',
  imports: [NgTemplateOutlet],
  templateUrl: './adapted-preview.html',
  styleUrl: './adapted-preview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdaptedPreview {
  readonly markdown = input.required<string>();
  readonly unverified = input<readonly string[]>([]);
  readonly live = input(false);

  protected readonly i18n = inject(I18n);

  protected readonly blocks = computed<PreviewBlock[]>(() => {
    const terms = this.live() ? [] : this.unverified();
    const line = (text: InlineText): PreviewLine =>
      text.flatMap((segment) =>
        splitByTerms(segment.text, terms).map((part) => ({ ...segment, ...part })),
      );

    return parseMarkdownBlocks(this.markdown()).map((block): PreviewBlock => {
      switch (block.kind) {
        case 'heading':
          return { kind: 'heading', level: block.level, line: line(block.text) };
        case 'paragraph':
          return { kind: 'paragraph', lines: block.lines.map(line) };
        case 'list':
          return { kind: 'list', ordered: block.ordered, items: block.items.map(line) };
        case 'rule':
          return block;
      }
    });
  });
}
