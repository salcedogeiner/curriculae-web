import { containsFolded, foldText } from '../../core/text/fold';
import {
  inlineToPlainText,
  parseMarkdownBlocks,
  type InlineText,
  type MarkdownBlock,
} from '../../core/text/markdown-blocks';

/**
 * Enforcement layer 2 of the no-invented-facts rule (cv-pipeline skill).
 *
 * Two checks, both against the base CV:
 * 1. claims a rewrite could fabricate — proper nouns, technology names,
 *    acronyms and numbers — that the base CV does not contain;
 * 2. words borrowed from the vacancy, in any case, that the base CV has no
 *    form of. This is the common failure in practice: a model "tailoring" a CV
 *    copies "signals, componentes standalone" or "mentoría a perfiles junior"
 *    straight from the job ad, in lower case, past any capital-letter rule.
 *
 * It is a heuristic and errs on the side of reporting:
 * a false alarm costs the user a glance, a missed invention costs them a lie
 * sent under their own name. The UI marks every term it returns as
 * "no verificado" before export.
 */

const MAX_TERMS = 40;

/**
 * Words a rewrite legitimately adds in capitals without adding a fact: section
 * titles, months, connectors that start a bullet. Folded form.
 */
const ALLOWED = new Set(
  [
    'perfil',
    'perfil profesional',
    'resumen',
    'sobre mi',
    'experiencia',
    'experiencia profesional',
    'experiencia laboral',
    'educacion',
    'formacion',
    'formacion academica',
    'habilidades',
    'competencias',
    'conocimientos',
    'tecnologias',
    'herramientas',
    'idiomas',
    'contacto',
    'datos',
    'logros',
    'proyectos',
    'certificaciones',
    'cursos',
    'referencias',
    'intereses',
    'otros',
    'tecnicas',
    'blandas',
    'actualidad',
    'presente',
    'hoy',
    'nivel',
    'principales',
    'summary',
    'profile',
    'experience',
    'education',
    'skills',
    'languages',
    'projects',
    'present',
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'setiembre',
    'octubre',
    'noviembre',
    'diciembre',
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ].map(foldText),
);

/** Words or symbols after which a capital letter is just a sentence start. */
const SENTENCE_BREAK = /[.:;!?¡¿•·|—–\-()[\]"“”]$/;

export function findUnverifiedTerms(baseCv: string, adaptedCv: string, vacancy = ''): string[] {
  const foldedBase = foldText(baseCv);
  const baseWords = new Set(foldedBase.split(' '));
  const vacancyWords = new Set(
    foldText(vacancy)
      .split(' ')
      .filter((word) => word.length >= MIN_STEM),
  );
  const found = new Map<string, string>();

  const flag = (term: string, folded: string): void => {
    if (folded !== '' && !ALLOWED.has(folded) && !found.has(folded)) {
      found.set(folded, term);
    }
  };

  for (const line of textLines(parseMarkdownBlocks(adaptedCv))) {
    for (const term of candidateTerms(line)) {
      const folded = foldText(term);
      if (!containsFolded(foldedBase, folded)) {
        flag(term, folded);
      }
    }

    for (const raw of line.split(/\s+/)) {
      const word = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      const folded = foldText(word);
      if (
        folded.length >= MIN_STEM &&
        !folded.includes(' ') &&
        hasStemIn(folded, vacancyWords) &&
        !hasStemIn(folded, baseWords)
      ) {
        flag(word, folded);
      }
    }
  }

  return [...found.values()].slice(0, MAX_TERMS);
}

/** Shorter words are mostly connectors; longer prefixes miss Spanish inflection. */
const MIN_STEM = 5;
const STEM_LENGTH = 6;

/**
 * Whether `word` shares a stem with any word of `words`: "revisiones" matches
 * "revisión", "construí" matches "construyendo", "signals" matches nothing in
 * a CV that never mentions it.
 */
function hasStemIn(word: string, words: ReadonlySet<string>): boolean {
  if (words.has(word)) {
    return true;
  }
  for (const candidate of words) {
    const needed = Math.min(STEM_LENGTH, word.length, candidate.length);
    if (needed >= MIN_STEM && word.slice(0, needed) === candidate.slice(0, needed)) {
      return true;
    }
  }
  return false;
}

/** Every line of visible text, in reading order. */
function textLines(blocks: readonly MarkdownBlock[]): string[] {
  const lines: string[] = [];
  const add = (text: InlineText): void => {
    lines.push(inlineToPlainText(text));
  };
  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        add(block.text);
        break;
      case 'paragraph':
        block.lines.forEach(add);
        break;
      case 'list':
        block.items.forEach(add);
        break;
    }
  }
  return lines;
}

/**
 * The tokens of one line that carry a checkable fact. Sentence-initial capitals
 * are skipped unless they look technical, because "Lideré" is a verb, not an
 * employer.
 */
function candidateTerms(line: string): string[] {
  const terms: string[] = [];
  const tokens = line.split(/\s+/).filter(Boolean);
  let previous = '';

  for (const raw of tokens) {
    const token = raw.replace(/^[^\p{L}\p{N}+#]+|[^\p{L}\p{N}+#%]+$/gu, '');
    const atSentenceStart = previous === '' || SENTENCE_BREAK.test(previous);
    previous = raw;

    if (token === '') {
      continue;
    }
    if (/\p{N}/u.test(token)) {
      // Years, percentages, versions, figures — "5 años" is a claim too.
      terms.push(token);
    } else if (looksTechnical(token)) {
      terms.push(token);
    } else if (!atSentenceStart && /^\p{Lu}/u.test(token)) {
      terms.push(token);
    }
  }
  return terms;
}

/** Node.js, C#, C++, TypeScript, iOS, AWS, SQL… */
function looksTechnical(token: string): boolean {
  return (
    /[+#]/.test(token) ||
    /\p{L}\.\p{L}/u.test(token) ||
    /^\p{Lu}{2,}s?$/u.test(token) ||
    /\p{Ll}\p{Lu}/u.test(token)
  );
}

export interface FlaggedSegment {
  readonly text: string;
  readonly flagged: boolean;
}

/** Splits a text so the unverified terms inside it can be marked in the preview. */
export function splitByTerms(text: string, terms: readonly string[]): FlaggedSegment[] {
  if (terms.length === 0 || text === '') {
    return [{ text, flagged: false }];
  }
  const pattern = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const matcher = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'giu');

  const segments: FlaggedSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(matcher)) {
    if (match.index > last) {
      segments.push({ text: text.slice(last, match.index), flagged: false });
    }
    segments.push({ text: match[0], flagged: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), flagged: false });
  }
  return segments;
}
