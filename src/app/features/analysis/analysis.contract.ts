import { LlmError } from '../../core/llm/engine.types';
import { containsFolded, foldText } from '../../core/text/fold';

/**
 * The analysis JSON contract (cv-pipeline skill, step 3) and its validator.
 *
 * The model is an untrusted source of structured data: every field is checked,
 * unknown values are dropped or coerced, evidence quotes are verified against
 * the base CV, and the score is computed here from the verdicts — a model asked
 * for a number produces a confident, meaningless one.
 */

export type RequirementCategory =
  'skill' | 'experience' | 'education' | 'language' | 'soft' | 'other';
export type RequirementImportance = 'must' | 'nice' | 'plus';
export type RequirementVerdict = 'match' | 'partial' | 'missing' | 'unverifiable';

export interface Requirement {
  readonly text: string;
  readonly category: RequirementCategory;
  readonly importance: RequirementImportance;
  readonly verdict: RequirementVerdict;
  /** A verbatim quote from the BASE CV, verified; `null` when there is none. */
  readonly evidence: string | null;
}

export interface Analysis {
  readonly jobTitle: string | null;
  readonly company: string | null;
  /** 0–100, computed by `computeScore`, never taken from the model. */
  readonly score: number;
  readonly summary: string;
  readonly requirements: readonly Requirement[];
  /** Requirements the CV has no evidence for, derived from the verdicts. */
  readonly gaps: readonly string[];
  readonly strengths: readonly string[];
}

const CATEGORIES: readonly RequirementCategory[] = [
  'skill',
  'experience',
  'education',
  'language',
  'soft',
  'other',
];
const IMPORTANCES: readonly RequirementImportance[] = ['must', 'nice', 'plus'];
const VERDICTS: readonly RequirementVerdict[] = ['match', 'partial', 'missing', 'unverifiable'];

/** Constrains Ollama's output (`format`) and doubles as the spec in the prompt. */
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    jobTitle: { type: ['string', 'null'] },
    company: { type: ['string', 'null'] },
    summary: { type: 'string' },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          importance: { type: 'string', enum: IMPORTANCES },
          verdict: { type: 'string', enum: VERDICTS },
          evidence: { type: ['string', 'null'] },
        },
        required: ['text', 'category', 'importance', 'verdict', 'evidence'],
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['jobTitle', 'company', 'summary', 'requirements', 'strengths'],
} as const;

const MAX_REQUIREMENTS = 30;
const MAX_STRENGTHS = 8;

/**
 * Weights for the score: a must-have counts three times a "plus". Unverifiable
 * requirements (soft skills, mostly) are left out of the denominator — the CV
 * cannot prove them either way, so they must not drag the score down.
 */
const IMPORTANCE_WEIGHT: Readonly<Record<RequirementImportance, number>> = {
  must: 3,
  nice: 2,
  plus: 1,
};
const VERDICT_CREDIT: Readonly<Record<Exclude<RequirementVerdict, 'unverifiable'>, number>> = {
  match: 1,
  partial: 0.5,
  missing: 0,
};

export function computeScore(requirements: readonly Requirement[]): number {
  let earned = 0;
  let possible = 0;
  for (const requirement of requirements) {
    if (requirement.verdict === 'unverifiable') {
      continue;
    }
    const weight = IMPORTANCE_WEIGHT[requirement.importance];
    possible += weight;
    earned += weight * VERDICT_CREDIT[requirement.verdict];
  }
  return possible === 0 ? 0 : Math.max(0, Math.min(100, Math.round((earned / possible) * 100)));
}

export type ScoreLevel = 'high' | 'medium' | 'low';

/** The band a score falls in: the report and the history colour it the same way. */
export function scoreLevel(score: number): ScoreLevel {
  return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
}

/**
 * Validates and normalises the parsed model answer. Throws `malformed-json`
 * only when nothing usable is left; a single bad requirement is dropped, not
 * fatal (llm-integration skill: a wrong field is a normal outcome).
 */
export function parseAnalysis(raw: unknown, baseCv: string): Analysis {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LlmError('malformed-json', 'El análisis no es un objeto');
  }
  const value = raw as Record<string, unknown>;
  const foldedCv = foldText(baseCv);

  const requirements = (Array.isArray(value['requirements']) ? value['requirements'] : [])
    .map((entry) => toRequirement(entry, foldedCv))
    .filter((entry): entry is Requirement => entry !== null)
    .slice(0, MAX_REQUIREMENTS);

  if (requirements.length === 0) {
    throw new LlmError('malformed-json', 'El análisis no incluye ningún requisito válido');
  }

  return {
    jobTitle: cleanString(value['jobTitle'], 120),
    company: cleanString(value['company'], 120),
    score: computeScore(requirements),
    summary: cleanString(value['summary'], 600) ?? '',
    requirements,
    gaps: requirements.filter((r) => r.verdict === 'missing').map((r) => r.text),
    strengths: (Array.isArray(value['strengths']) ? value['strengths'] : [])
      .map((entry) => cleanString(entry, 200))
      .filter((entry): entry is string => entry !== null)
      .slice(0, MAX_STRENGTHS),
  };
}

/**
 * Rebuilds an `Analysis` read back from a generation folder; `null` when it does
 * not fit. The evidence was verified against the CV when the analysis was made,
 * so it is not re-checked (an empty CV skips that step), but every field is
 * still validated — the file is on disk and anyone can have edited it.
 */
export function reviveAnalysis(raw: unknown): Analysis | null {
  try {
    return parseAnalysis(raw, '');
  } catch {
    return null;
  }
}

function toRequirement(entry: unknown, foldedCv: string): Requirement | null {
  if (entry === null || typeof entry !== 'object') {
    return null;
  }
  const value = entry as Record<string, unknown>;
  const text = cleanString(value['text'], 300);
  if (text === null) {
    return null;
  }

  let verdict = pick(value['verdict'], VERDICTS, VERDICT_SYNONYMS) ?? 'unverifiable';
  let evidence = cleanString(value['evidence'], 400);

  // The evidence must be a quote from the CV. One that is not there is a
  // paraphrase at best and an invention at worst: drop it, and a verdict that
  // stood on it can no longer claim a match (cv-pipeline skill, step 3).
  if (evidence !== null && foldedCv !== '' && !isQuotedFrom(evidence, foldedCv)) {
    evidence = null;
  }
  if (evidence === null && foldedCv !== '' && (verdict === 'match' || verdict === 'partial')) {
    verdict = 'unverifiable';
  }

  return {
    text,
    category: pick(value['category'], CATEGORIES, {}) ?? 'other',
    importance: pick(value['importance'], IMPORTANCES, IMPORTANCE_SYNONYMS) ?? 'nice',
    verdict,
    evidence,
  };
}

/** A quote may be elided with "…": every elided part must appear in the CV. */
export function isQuotedFrom(evidence: string, foldedCv: string): boolean {
  const parts = evidence
    .split(/…|\.\.\./)
    .map((part) => foldText(part))
    .filter((part) => part.length >= 3);
  return parts.length > 0 && parts.every((part) => containsFolded(foldedCv, part));
}

/* Models without constrained output answer in Spanish now and then. */
const VERDICT_SYNONYMS: Readonly<Record<string, RequirementVerdict>> = {
  cumple: 'match',
  coincide: 'match',
  parcial: 'partial',
  falta: 'missing',
  'no cumple': 'missing',
  ausente: 'missing',
  'no verificable': 'unverifiable',
};
const IMPORTANCE_SYNONYMS: Readonly<Record<string, RequirementImportance>> = {
  obligatorio: 'must',
  imprescindible: 'must',
  required: 'must',
  deseable: 'nice',
  valorable: 'plus',
};

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  synonyms: Readonly<Record<string, T>>,
): T | null {
  if (typeof value !== 'string') {
    return null;
  }
  const key = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(key) ? (key as T) : (synonyms[key] ?? null);
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.replace(/\s+/g, ' ').trim();
  if (text === '' || /^(null|n\/a|ninguno|ninguna|desconocido)$/i.test(text)) {
    return null;
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
