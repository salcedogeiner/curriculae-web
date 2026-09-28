/**
 * Text normalisation for the base CV, in one plain-text shape for all four
 * sources (cv-pipeline skill, step 1). The section split — contact / profile /
 * experience / education / skills — is layered on top of this, not inside it.
 *
 * It lives in `core` and not in the import pipeline because two unrelated
 * consumers need it: the parser normalises a freshly extracted file, and the
 * storage repository re-derives the same normalisation to check that a payload
 * read back from `localStorage` is internally consistent. A `core` module that
 * imported a feature module in order to reach two dependency-free functions
 * would invert the layering AGENTS.md §3 sets up.
 */

/** Windows and classic-Mac line endings → `\n`, no trailing blanks, no triple gaps. */
export function normaliseCvText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Whether the text carries anything other than whitespace.
 *
 * A PDF with no text layer is almost always a scan, and the fix differs from an
 * empty `.txt`, so the caller turns a `false` here into a specific error rather
 * than one generic "empty file" message.
 */
export function hasReadableContent(text: string): boolean {
  return text.replace(/\s/g, '').length > 0;
}
