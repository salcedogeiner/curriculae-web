import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_MODEL,
  CLAUDE_ENGINE,
  FakeLlmBackend,
  LOCAL_MODEL,
  OLLAMA_ENGINE,
} from '../../../testing/fake-llm';
import { PREFERENCES_KEY } from '../storage/preferences.repository';
import { LlmError } from './engine.types';
import { LLM_BACKEND } from './llm-backend';
import { LlmService } from './llm.service';

describe('LlmService', () => {
  let backend: FakeLlmBackend;

  beforeEach(() => {
    localStorage.clear();
    backend = new FakeLlmBackend();
    backend.engines = [CLAUDE_ENGINE, OLLAMA_ENGINE];
  });

  function create(): LlmService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: LLM_BACKEND, useValue: backend }] });
    return TestBed.inject(LlmService);
  }

  it('ordena los motores locales primero', async () => {
    const llm = create();
    await llm.detect();

    expect(llm.engines().map((engine) => engine.id)).toEqual(['ollama', 'claude']);
    expect(llm.detected()).toBe(true);
  });

  it('selecciona un modelo local por defecto, nunca un agente', async () => {
    const llm = create();
    await llm.detect();

    expect(llm.selectedModel()?.id).toBe(LOCAL_MODEL.id);
  });

  it('con solo agentes disponibles no selecciona nada', async () => {
    backend.engines = [CLAUDE_ENGINE];
    const llm = create();
    await llm.detect();

    expect(llm.selectedModel()).toBeNull();
    expect(llm.ready()).toBe(false);
  });

  it('recuerda la selección entre sesiones', async () => {
    const first = create();
    await first.detect();
    first.select(AGENT_MODEL.id);

    const second = create();
    await second.detect();
    expect(second.selectedModel()?.id).toBe(AGENT_MODEL.id);
  });

  it('un agente exige consentimiento antes de estar listo', async () => {
    const llm = create();
    await llm.detect();
    llm.select(AGENT_MODEL.id);

    expect(llm.needsConsent()).toBe(true);
    expect(llm.ready()).toBe(false);

    llm.setAgentConsent(true);
    expect(llm.ready()).toBe(true);
  });

  it('rechaza una llamada a un agente sin consentimiento, sin tocar el backend', async () => {
    const llm = create();
    await llm.detect();

    const error = await llm
      .complete({ model: AGENT_MODEL, messages: [{ role: 'user', content: 'CV' }], temperature: 0 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).code).toBe('consent-required');
    expect(backend.requests).toHaveLength(0);
  });

  it('el consentimiento se guarda aparte de la selección y se puede revocar', async () => {
    const llm = create();
    await llm.detect();
    llm.select(AGENT_MODEL.id);
    llm.setAgentConsent(true);
    llm.setAgentConsent(false);

    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY)!);
    expect(stored).toEqual({
      schemaVersion: 1,
      selectedModelId: AGENT_MODEL.id,
      agentConsent: false,
    });
  });

  it('ignora una selección que no existe', async () => {
    const llm = create();
    await llm.detect();
    llm.select('ollama:inventado');

    expect(llm.selectedModel()?.id).toBe(LOCAL_MODEL.id);
  });

  it('una respuesta vacía es empty-response', async () => {
    backend.respond('   ');
    const llm = create();

    await expect(
      llm.complete({
        model: LOCAL_MODEL,
        messages: [{ role: 'user', content: 'x' }],
        temperature: 0,
      }),
    ).rejects.toMatchObject({ code: 'empty-response' });
  });

  it('descarta preferencias de otra versión del esquema', async () => {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ schemaVersion: 99, selectedModelId: 'x', agentConsent: true }),
    );
    const llm = create();

    expect(llm.agentConsent()).toBe(false);
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });
});
