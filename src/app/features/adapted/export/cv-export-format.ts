import {
  documentTitle,
  inlineToPlainText,
  parseMarkdownBlocks,
  type InlineText,
  type MarkdownBlock,
} from '../../../core/text/markdown-blocks';

/**
 * Turns the adapted CV into export payloads (cv-pipeline skill, step 5). All
 * three walk the same parsed blocks as the preview, so an export never writes
 * anything the preview does not show.
 */

/** `<nombre>-<puesto>-<empresa>.<ext>`, safe on every filesystem. */
export function exportFileName(
  markdown: string,
  jobTitle: string | null,
  company: string | null,
  extension: 'pdf' | 'docx' | 'md',
): string {
  const name = documentTitle(parseMarkdownBlocks(markdown));
  const parts = [name, jobTitle, company].map((part) => slug(part ?? '')).filter(Boolean);
  return `${parts.join('-').slice(0, 90) || 'hoja-de-vida'}.${extension}`;
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/* ── HTML, for PDF ─────────────────────────────────────────────── */

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function inlineHtml(text: InlineText): string {
  return text
    .map((segment) => {
      const safe = escapeHtml(segment.text);
      return segment.strong
        ? `<strong>${safe}</strong>`
        : segment.emphasis
          ? `<em>${safe}</em>`
          : safe;
    })
    .join('');
}

function blockHtml(block: MarkdownBlock): string {
  switch (block.kind) {
    case 'heading':
      return `<h${block.level}>${inlineHtml(block.text)}</h${block.level}>`;
    case 'paragraph':
      return `<p>${block.lines.map(inlineHtml).join('<br>')}</p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${tag}>`;
    }
    case 'rule':
      return '<hr>';
  }
}

/**
 * A self-contained, script-free document for the PDF renderer. Every string is
 * escaped (job titles and company names carry `&`, `<`, `"`), and the desktop
 * app loads it in a window with JavaScript disabled, so even a miss could not
 * run anything.
 *
 * The colours below are print colours for a standalone document, not app
 * styles, which is why they are literal: paper is white and ink is black
 * whatever the app theme (styling skill, print stylesheet). The metrics mirror
 * the skill's `@media print` block: A4, 14/16 mm margins, 10.5 pt.
 */
export function renderCvHtml(markdown: string): string {
  const blocks = parseMarkdownBlocks(markdown);
  const title = escapeHtml(documentTitle(blocks) ?? 'Hoja de vida');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${title}</title>
<style>
@page { size: A4; margin: 14mm 16mm; }
body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #000; background: #fff; }
h1 { font-size: 20pt; margin: 0 0 4pt; }
h2 { font-size: 11.5pt; text-transform: uppercase; letter-spacing: .04em; margin: 14pt 0 4pt; padding-bottom: 2pt; border-bottom: 1px solid #555; break-after: avoid; }
h3 { font-size: 10.5pt; margin: 8pt 0 2pt; break-after: avoid; }
p { margin: 0 0 4pt; }
ul, ol { margin: 0 0 6pt; padding-left: 14pt; }
li { margin-bottom: 1pt; break-inside: avoid; }
hr { border: 0; border-top: 1px solid #999; }
</style></head>
<body>${blocks.map(blockHtml).join('\n')}</body></html>`;
}

/* ── DOCX ──────────────────────────────────────────────────────── */

/**
 * An editable Word document with real headings and lists, not a block of
 * preformatted text (cv-pipeline skill). `docx` is `import()`ed here so it stays
 * out of the initial bundle.
 */
export async function renderCvDocx(markdown: string): Promise<Uint8Array> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');

  const runs = (text: InlineText, breakBefore = false) =>
    text.map(
      (segment, index) =>
        new TextRun({
          text: segment.text,
          bold: segment.strong,
          italics: segment.emphasis,
          break: breakBefore && index === 0 ? 1 : undefined,
        }),
    );

  const headings = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2] as const;
  const paragraphs = parseMarkdownBlocks(markdown).flatMap((block) => {
    switch (block.kind) {
      case 'heading':
        return [new Paragraph({ heading: headings[block.level - 1], children: runs(block.text) })];
      case 'paragraph':
        return [new Paragraph({ children: block.lines.flatMap((line, i) => runs(line, i > 0)) })];
      case 'list':
        return block.items.map((item, index) =>
          block.ordered
            ? new Paragraph({ children: [new TextRun(`${index + 1}. `), ...runs(item)] })
            : new Paragraph({ bullet: { level: 0 }, children: runs(item) }),
        );
      case 'rule':
        return [new Paragraph({ children: [] })];
    }
  });

  const title = documentTitle(parseMarkdownBlocks(markdown)) ?? 'Hoja de vida';
  const doc = new Document({
    title,
    creator: 'Curriculae',
    sections: [{ children: paragraphs }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

/** Plain text for the clipboard: the Markdown markers a mail client would show raw are dropped. */
export function renderCvPlainText(markdown: string): string {
  return parseMarkdownBlocks(markdown)
    .map((block) => {
      switch (block.kind) {
        case 'heading':
          return inlineToPlainText(block.text).toUpperCase();
        case 'paragraph':
          return block.lines.map(inlineToPlainText).join('\n');
        case 'list':
          return block.items
            .map((item, i) => `${block.ordered ? `${i + 1}.` : '•'} ${inlineToPlainText(item)}`)
            .join('\n');
        case 'rule':
          return '';
      }
    })
    .join('\n\n');
}
