/**
 * A deliberately small Markdown reader for the adapted CV.
 *
 * The model writes the adapted CV in Markdown, and that text is untrusted
 * (AGENTS.md §8). Instead of rendering it to HTML and sanitising, this turns it
 * into plain data — headings, paragraphs, lists, inline bold/italic — that the
 * templates render through interpolation and that the PDF and DOCX exporters
 * walk. No string from the model ever reaches `innerHTML`, so there is nothing
 * to sanitise and nothing to forget to sanitise.
 *
 * It covers what a CV uses. Tables, images, raw HTML and nested lists degrade
 * to plain text, which is the safe direction to fail in.
 */

export interface InlineSegment {
  readonly text: string;
  readonly strong: boolean;
  readonly emphasis: boolean;
}

export type InlineText = readonly InlineSegment[];

export type MarkdownBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: InlineText }
  /** One entry per source line: CV contact lines rely on their line breaks. */
  | { readonly kind: 'paragraph'; readonly lines: readonly InlineText[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly InlineText[] }
  | { readonly kind: 'rule' };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+•]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const INDENTED = /^\s{2,}\S/;

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraph.map(parseInline) });
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (list !== null) {
      blocks.push({ kind: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
      list = null;
    }
  };

  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\s+$/, '');

    if (line.trim() === '' || line.trim().startsWith('```')) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: parseInline(heading[2]) });
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'rule' });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    const item = bullet ?? ordered;
    if (item) {
      flushParagraph();
      const isOrdered = ordered !== null;
      if (list !== null && list.ordered !== isOrdered) {
        flushList();
      }
      list ??= { ordered: isOrdered, items: [] };
      list.items.push(item[1]);
      continue;
    }

    // An indented line right after a list item continues that item.
    if (list !== null && INDENTED.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}

/** `**negrita**`, `*cursiva*`, `` `código` `` and `[texto](url)`; everything else is text. */
const INLINE =
  /\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w])|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): InlineText {
  const segments: InlineSegment[] = [];
  const push = (value: string, strong = false, emphasis = false): void => {
    if (value !== '') {
      segments.push({ text: value, strong, emphasis });
    }
  };

  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    push(text.slice(last, match.index));
    const [, strongA, strongB, emA, emB, code, linkText, linkUrl] = match;
    if (strongA !== undefined || strongB !== undefined) {
      push(strongA ?? strongB, true);
    } else if (emA !== undefined || emB !== undefined) {
      push(emA ?? emB, false, true);
    } else if (code !== undefined) {
      push(code);
    } else {
      // The URL stays visible: on paper a link is only useful if it can be read.
      push(linkText === linkUrl ? linkUrl : `${linkText} (${linkUrl})`);
    }
    last = match.index + match[0].length;
  }
  push(text.slice(last));
  return segments;
}

export function inlineToPlainText(text: InlineText): string {
  return text.map((segment) => segment.text).join('');
}

/** The first level-1 heading — by the prompt's contract, the person's name. */
export function documentTitle(blocks: readonly MarkdownBlock[]): string | null {
  const heading = blocks.find((block) => block.kind === 'heading' && block.level === 1);
  return heading?.kind === 'heading' ? inlineToPlainText(heading.text).trim() || null : null;
}
