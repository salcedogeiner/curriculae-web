import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_MODEL,
  CLAUDE_ENGINE,
  FakeLlmBackend,
  OLLAMA_ENGINE,
} from '../../../../testing/fake-llm';
import { LLM_BACKEND } from '../../../core/llm/llm-backend';
import { LlmService } from '../../../core/llm/llm.service';
import { ModelSelector } from './model-selector';

describe('ModelSelector', () => {
  let backend: FakeLlmBackend;

  beforeEach(() => {
    localStorage.clear();
    backend = new FakeLlmBackend();
  });

  async function render() {
    await TestBed.configureTestingModule({
      imports: [ModelSelector],
      providers: [{ provide: LLM_BACKEND, useValue: backend }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ModelSelector);
    await TestBed.inject(LlmService).detect();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('agrupa los modelos por motor e indica si son locales', async () => {
    backend.engines = [OLLAMA_ENGINE, CLAUDE_ENGINE];
    const { el } = await render();
    const groups = [...el.querySelectorAll('optgroup')].map((group) => group.label);

    expect(groups).toEqual(['Ollama · local', 'Claude · agente en la nube']);
    expect(el.querySelector('label')?.getAttribute('for')).toBe(el.querySelector('select')?.id);
  });

  it('marca un modelo local como privado', async () => {
    const { el } = await render();

    expect(el.querySelector('.badge--local')?.textContent).toContain('Privado');
    expect(el.querySelector('.consent')).toBeNull();
  });

  it('elegir un agente muestra la insignia de nube y pide consentimiento revocable', async () => {
    backend.engines = [OLLAMA_ENGINE, CLAUDE_ENGINE];
    const { fixture, el } = await render();
    const llm = TestBed.inject(LlmService);

    const select = el.querySelector('select')!;
    select.value = AGENT_MODEL.id;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(el.querySelector('.badge--agent')?.textContent).toContain('Nube');
    expect(el.querySelector('.consent')?.textContent).toContain('Claude');
    const checkbox = el.querySelector<HTMLInputElement>('.consent input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    expect(llm.needsConsent()).toBe(true);

    checkbox.click();
    await fixture.whenStable();
    expect(llm.agentConsent()).toBe(true);

    checkbox.click();
    await fixture.whenStable();
    expect(llm.agentConsent()).toBe(false);
  });

  it('sin motores explica cómo instalar uno', async () => {
    backend.engines = [{ ...OLLAMA_ENGINE, status: 'unavailable', models: [] }];
    const { el } = await render();

    expect(el.textContent).toContain('No se encontró ningún motor de IA');
    expect(el.querySelector('.model__command')?.textContent).toContain('ollama pull');
    expect(el.querySelector('select')?.disabled).toBe(true);
  });

  it('si el navegador bloquea Ollama por CORS da el comando exacto', async () => {
    backend.engines = [{ ...OLLAMA_ENGINE, status: 'blocked', models: [] }];
    const { el } = await render();

    expect(el.querySelector('.model__command')?.textContent).toContain(
      'OLLAMA_ORIGINS=http://localhost:4200',
    );
  });

  it('lista el estado de cada motor revisado', async () => {
    backend.engines = [OLLAMA_ENGINE, { ...CLAUDE_ENGINE, status: 'unavailable', models: [] }];
    const { el } = await render();
    const items = [...el.querySelectorAll('.engines__item')].map((item) =>
      [...item.querySelectorAll('span')].map((span) => span.textContent?.trim()),
    );

    expect(items).toEqual([
      ['Ollama', '1 modelo'],
      ['Claude', 'no encontrado'],
    ]);
  });
});
