import { describe, expect, it } from 'vitest';
import { LlmError } from './engine.types';
import { extractJsonObject, stripReasoning } from './json-response';

function malformed(answer: string): LlmError {
  try {
    extractJsonObject(answer);
  } catch (error) {
    return error as LlmError;
  }
  throw new Error('se esperaba un error');
}

describe('extractJsonObject', () => {
  it('lee un objeto limpio', () => {
    expect(extractJsonObject('{"a": 1}')).toEqual({ a: 1 });
  });

  it('quita los bloques de código markdown', () => {
    expect(extractJsonObject('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('tolera prosa antes y después del objeto', () => {
    expect(extractJsonObject('Aquí tienes:\n{"a": {"b": 2}}\nEspero que sirva.')).toEqual({
      a: { b: 2 },
    });
  });

  it('no se confunde con llaves dentro de cadenas', () => {
    expect(extractJsonObject('{"texto": "usa { y } sin problema"} fin')).toEqual({
      texto: 'usa { y } sin problema',
    });
  });

  it('descarta el razonamiento de un modelo que piensa en voz alta', () => {
    expect(extractJsonObject('<think>quizá {"x": 0}</think>{"a": 1}')).toEqual({ a: 1 });
  });

  it('una respuesta sin objeto es malformed-json, no una excepción genérica', () => {
    const error = malformed('No puedo ayudarte con eso.');
    expect(error).toBeInstanceOf(LlmError);
    expect(error.code).toBe('malformed-json');
  });

  it('un objeto truncado es malformed-json', () => {
    expect(malformed('{"a": [1, 2').code).toBe('malformed-json');
  });

  it('JSON inválido dentro de las llaves es malformed-json', () => {
    expect(malformed("{'a': 1}").code).toBe('malformed-json');
  });
});

describe('stripReasoning', () => {
  it('quita un cierre de razonamiento sin apertura (stream ya empezado)', () => {
    expect(stripReasoning('pensando…</think># Ana')).toBe('# Ana');
  });
});
