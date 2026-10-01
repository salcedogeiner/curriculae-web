/**
 * Comparison form of a text: lower case, no diacritics, punctuation and runs of
 * whitespace collapsed to one space. "Gestión  de-proyectos" and "gestion de
 * proyectos" fold to the same string.
 *
 * Used wherever the app checks that something the model wrote is really in the
 * user's CV — an evidence quote, a skill, a number — so that a change of accent
 * or line wrap is not mistaken for an invention.
 */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim();
}

/** Whether `needle` appears in `haystack` as whole words, both already folded. */
export function containsFolded(haystack: string, needle: string): boolean {
  if (needle === '') {
    return false;
  }
  return ` ${haystack} `.includes(` ${needle} `);
}
