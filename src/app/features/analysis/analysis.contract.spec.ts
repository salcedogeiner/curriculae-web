import { describe, expect, it } from 'vitest';
import { LlmError } from '../../core/llm/engine.types';
import {
  computeScore,
  isQuotedFrom,
  parseAnalysis,
  reviveAnalysis,
  type Requirement,
} from './analysis.contract';
import { foldText } from '../../core/text/fold';

const CV = `Ana López
EXPERIENCIA
Desarrolladora frontend en Acme (2020 – 2024). Migré la aplicación a Angular 17.
Idiomas: inglés B2.`;

function requirement(overrides: Partial<Requirement>): Requirement {
  return {
    text: 'x',
    category: 'skill',
    importance: 'must',
    verdict: 'match',
    evidence: null,
    ...overrides,
  };
}

describe('computeScore', () => {
  it('pondera obligatorios por encima de los extras', () => {
    const score = computeScore([
      requirement({ importance: 'must', verdict: 'match' }),
      requirement({ importance: 'plus', verdict: 'missing' }),
    ]);
    // 3 / (3 + 1)
    expect(score).toBe(75);
  });

  it('un parcial vale la mitad', () => {
    expect(computeScore([requirement({ verdict: 'partial' })])).toBe(50);
  });

  it('los no verificables no cuentan, ni a favor ni en contra', () => {
    expect(
      computeScore([requirement({ verdict: 'match' }), requirement({ verdict: 'unverifiable' })]),
    ).toBe(100);
  });

  it('sin requisitos verificables la puntuación es 0, no NaN', () => {
    expect(computeScore([requirement({ verdict: 'unverifiable' })])).toBe(0);
  });
});

describe('parseAnalysis', () => {
  const valid = {
    jobTitle: 'Frontend Angular',
    company: 'Globex',
    summary: 'Encaja bien.',
    score: 999,
    requirements: [
      {
        text: 'Angular',
        category: 'skill',
        importance: 'must',
        verdict: 'match',
        evidence: 'Migré la aplicación a Angular 17',
      },
      {
        text: 'Kubernetes',
        category: 'skill',
        importance: 'nice',
        verdict: 'missing',
        evidence: null,
      },
    ],
    strengths: ['Angular', 42, ''],
  };

  it('calcula la puntuación en la app e ignora la del modelo', () => {
    const analysis = parseAnalysis(valid, CV);
    // must match (3) + nice missing (0) over 5.
    expect(analysis.score).toBe(60);
  });

  it('deriva las brechas de los veredictos', () => {
    expect(parseAnalysis(valid, CV).gaps).toEqual(['Kubernetes']);
  });

  it('limpia las fortalezas que no son texto', () => {
    expect(parseAnalysis(valid, CV).strengths).toEqual(['Angular']);
  });

  it('una evidencia que no está en el CV se descarta y el match queda como no verificable', () => {
    const analysis = parseAnalysis(
      {
        ...valid,
        requirements: [
          {
            text: 'Kubernetes',
            category: 'skill',
            importance: 'must',
            verdict: 'match',
            evidence: 'Experto en Kubernetes',
          },
        ],
      },
      CV,
    );
    expect(analysis.requirements[0]).toMatchObject({ evidence: null, verdict: 'unverifiable' });
  });

  it('acepta una cita con otra tildación o salto de línea', () => {
    const analysis = parseAnalysis(
      {
        ...valid,
        requirements: [
          {
            text: 'Inglés',
            category: 'language',
            importance: 'must',
            verdict: 'match',
            evidence: 'idiomas:  ingles B2',
          },
        ],
      },
      CV,
    );
    expect(analysis.requirements[0].verdict).toBe('match');
  });

  it('una cita de la vacante no cuenta como evidencia', () => {
    expect(isQuotedFrom('5 años con React y Kubernetes', foldText(CV))).toBe(false);
  });

  it('acepta veredictos en español de modelos sin salida restringida', () => {
    const analysis = parseAnalysis(
      {
        ...valid,
        requirements: [{ ...valid.requirements[1], verdict: 'falta', importance: 'obligatorio' }],
      },
      CV,
    );
    expect(analysis.requirements[0]).toMatchObject({ verdict: 'missing', importance: 'must' });
  });

  it('descarta requisitos sin texto y valores desconocidos caen a valores seguros', () => {
    const analysis = parseAnalysis(
      {
        requirements: [
          { text: '', verdict: 'match' },
          { text: 'Liderazgo', category: 'raro', importance: '???', verdict: '???' },
        ],
      },
      CV,
    );
    expect(analysis.requirements).toEqual([
      {
        text: 'Liderazgo',
        category: 'other',
        importance: 'nice',
        verdict: 'unverifiable',
        evidence: null,
      },
    ]);
    expect(analysis.jobTitle).toBeNull();
  });

  it('sin requisitos válidos es malformed-json', () => {
    expect(() => parseAnalysis({ requirements: [] }, CV)).toThrow(LlmError);
    expect(() => parseAnalysis([], CV)).toThrow(LlmError);
    expect(() => parseAnalysis('texto', CV)).toThrow(LlmError);
  });

  it('"null" como texto se trata como ausente', () => {
    expect(parseAnalysis({ ...valid, company: 'null' }, CV).company).toBeNull();
  });
});

describe('reviveAnalysis', () => {
  it('reconstruye un análisis guardado sin volver a exigir el CV', () => {
    const stored = parseAnalysis(
      {
        requirements: [
          {
            text: 'Angular',
            category: 'skill',
            importance: 'must',
            verdict: 'match',
            evidence: 'Angular 17',
          },
        ],
      },
      CV,
    );
    expect(reviveAnalysis(stored)).toEqual(stored);
  });

  it('devuelve null con un archivo manipulado', () => {
    expect(reviveAnalysis({ requirements: 'x' })).toBeNull();
  });
});
