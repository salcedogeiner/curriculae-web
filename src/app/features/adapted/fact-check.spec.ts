import { describe, expect, it } from 'vitest';
import { findUnverifiedTerms, splitByTerms } from './fact-check';

const BASE_CV = `# Laura Gómez Restrepo

laura.gomez@example.com · Medellín

## Perfil
Desarrolladora frontend con 6 años de experiencia construyendo aplicaciones web con Angular y TypeScript.

## Experiencia
### Desarrolladora Frontend Senior — Bancolombia (2021 – actualidad)
- Migré el portal de clientes de AngularJS a Angular 15, reduciendo el tiempo de carga un 40 %.
- Lideré un equipo de 4 personas y definí las guías de código y revisión.
- Implementé pruebas unitarias con Jest y pruebas end-to-end con Cypress.
### Desarrolladora Web — Globant (2018 – 2021)
- Desarrollé componentes reutilizables en Angular para clientes de retail.

## Habilidades
Angular, TypeScript, RxJS, Node.js, Git`;

const VACANCY = `Acme busca Desarrollador/a Frontend Angular Senior.
- Construir y mantener aplicaciones con Angular moderno (signals, componentes standalone).
- Mentorizar a desarrolladores junior y participar en revisiones de código.
Deseable: Kubernetes y AWS.`;

describe('findUnverifiedTerms', () => {
  it('una reformulación fiel no levanta ninguna alarma', () => {
    const adapted = `# Laura Gómez Restrepo

## Perfil
Desarrolladora frontend con 6 años construyendo aplicaciones con Angular y TypeScript.

## Experiencia profesional
### Desarrolladora Frontend Senior — Bancolombia (2021 – actualidad)
- Lideré un equipo de 4 personas y definí guías de revisión de código.
- Migré el portal de AngularJS a Angular 15: un 40 % menos de tiempo de carga.

## Habilidades
TypeScript, Angular, RxJS, Node.js`;

    expect(findUnverifiedTerms(BASE_CV, adapted, VACANCY)).toEqual([]);
  });

  it('marca una empresa, una tecnología y una cifra inventadas', () => {
    const adapted = `# Laura Gómez Restrepo
- Trabajé en Google desplegando con Kubernetes en AWS durante 8 años.`;

    expect(findUnverifiedTerms(BASE_CV, adapted)).toEqual(['Google', 'Kubernetes', 'AWS', '8']);
  });

  it('no confunde el verbo que abre una viñeta con un nombre propio', () => {
    expect(findUnverifiedTerms(BASE_CV, '- Optimicé el portal de clientes.')).toEqual([]);
  });

  /**
   * Regression fixture: a real qwen3.5 run (2026-10-01) copied these phrases
   * from the vacancy into the adapted CV. All lower case, so the proper-noun
   * rule alone let them through.
   */
  it('marca lo copiado de la vacante aunque esté en minúsculas', () => {
    const adapted = `## Perfil
Desarrolladora frontend con experiencia en Angular moderno (signals, componentes standalone).
- Mentoricé a desarrolladores junior y participé en revisiones de código.`;

    const terms = findUnverifiedTerms(BASE_CV, adapted, VACANCY);

    expect(terms).toEqual(
      expect.arrayContaining(['moderno', 'signals', 'standalone', 'Mentoricé', 'junior']),
    );
    // Inflections of words the CV does use are not inventions.
    expect(terms).not.toContain('revisiones');
    expect(terms).not.toContain('desarrolladores');
    expect(terms).not.toContain('componentes');
  });
});

describe('splitByTerms', () => {
  it('separa los términos marcados sin tocar el resto', () => {
    expect(splitByTerms('Usé AWS y aws-cli', ['AWS'])).toEqual([
      { text: 'Usé ', flagged: false },
      { text: 'AWS', flagged: true },
      { text: ' y ', flagged: false },
      { text: 'aws', flagged: true },
      { text: '-cli', flagged: false },
    ]);
  });

  it('no marca un término dentro de otra palabra', () => {
    expect(splitByTerms('Javascript', ['Java'])).toEqual([{ text: 'Javascript', flagged: false }]);
  });

  it('escapa los términos con caracteres de regex', () => {
    expect(splitByTerms('Sé C++ y C#', ['C++']).filter((s) => s.flagged)).toEqual([
      { text: 'C++', flagged: true },
    ]);
  });
});
