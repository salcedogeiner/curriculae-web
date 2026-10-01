import { describe, expect, it, vi } from 'vitest';
import { LOCAL_MODEL } from '../../../../testing/fake-llm';
import type { DesktopApi, DesktopChunk } from '../../desktop/desktop-api';
import { LlmError, llmErrorFromMessage } from '../engine.types';
import { DesktopLlmBackend } from './desktop-backend';

function fakeApi(complete: DesktopApi['llm']['complete']) {
  const listeners = new Set<(id: string, chunk: DesktopChunk) => void>();
  const api = {
    platform: 'linux',
    llm: {
      detect: vi.fn(async () => []),
      complete: vi.fn(complete),
      abort: vi.fn(),
      onChunk: (listener: (id: string, chunk: DesktopChunk) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    workspace: {} as DesktopApi['workspace'],
  } satisfies DesktopApi;
  const emit = (id: string, chunk: DesktopChunk) =>
    listeners.forEach((listener) => listener(id, chunk));
  return { api, emit, listeners };
}

const request = {
  model: LOCAL_MODEL,
  messages: [{ role: 'user' as const, content: 'hola' }],
  temperature: 0,
};

describe('DesktopLlmBackend', () => {
  it('reenvía solo los fragmentos de su propia petición y se desuscribe al terminar', async () => {
    const { api, emit, listeners } = fakeApi(async (id) => {
      emit(id, { kind: 'content', text: 'Ho' });
      emit('otra-peticion', { kind: 'content', text: 'XX' });
      emit(id, { kind: 'content', text: 'la' });
      return 'Hola';
    });
    const chunks: string[] = [];

    const answer = await new DesktopLlmBackend(api).complete(request, {
      onChunk: (c) => chunks.push(c.text),
    });

    expect(answer).toBe('Hola');
    expect(chunks).toEqual(['Ho', 'la']);
    expect(listeners.size).toBe(0);
  });

  it('cancelar envía abort al proceso principal con el mismo id', async () => {
    let seenId = '';
    const { api } = fakeApi(
      (id) =>
        new Promise((_resolve, reject) => {
          seenId = id;
          setTimeout(
            () =>
              reject(new Error("Error invoking remote method 'llm:complete': Error: [aborted] x")),
            5,
          );
        }),
    );
    const controller = new AbortController();

    const pending = new DesktopLlmBackend(api).complete(request, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
    expect(api.llm.abort).toHaveBeenCalledWith(seenId);
  });

  it('recupera el código de error del mensaje del proceso principal', async () => {
    const { api } = fakeApi(async () => {
      throw new Error("Error invoking remote method 'llm:complete': EngineError: [timeout] tardó");
    });

    await expect(new DesktopLlmBackend(api).complete(request, {})).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  it('un puente roto en la detección degrada a "sin motores"', async () => {
    const { api } = fakeApi(async () => '');
    api.llm.detect.mockRejectedValueOnce(new Error('boom'));

    await expect(new DesktopLlmBackend(api).detect()).resolves.toEqual([]);
  });
});

describe('llmErrorFromMessage', () => {
  it('un mensaje sin código es engine-failed', () => {
    const error = llmErrorFromMessage('algo raro');
    expect(error).toBeInstanceOf(LlmError);
    expect(error.code).toBe('engine-failed');
  });

  it('un código desconocido no se acepta tal cual', () => {
    expect(llmErrorFromMessage('[inventado] x').code).toBe('engine-failed');
  });
});
