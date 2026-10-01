import { LlmError } from './engine.types';

/**
 * Pulls one JSON object out of a model answer (llm-integration skill, "JSON
 * discipline"): strips a reasoning block and markdown fences, drops the prose
 * before the first `{` and after the matching `}`, then parses.
 *
 * Only the syntax is handled here. The caller still validates the shape — a
 * parsed object is not a trusted object.
 */
export function extractJsonObject(answer: string): unknown {
  const text = stripReasoning(answer)
    .replace(/```(?:json)?/gi, '')
    .trim();

  const start = text.indexOf('{');
  if (start === -1) {
    throw new LlmError('malformed-json', 'La respuesta no contiene un objeto JSON');
  }

  const end = matchingBrace(text, start);
  if (end === -1) {
    throw new LlmError('malformed-json', 'El objeto JSON de la respuesta está incompleto');
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    throw new LlmError('malformed-json', 'La respuesta no es JSON válido', error);
  }
}

/** `<think>…</think>` blocks that some engines inline into the content stream. */
export function stripReasoning(answer: string): string {
  return answer.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '');
}

/** Index of the `}` closing the object opened at `start`, ignoring braces in strings. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}
