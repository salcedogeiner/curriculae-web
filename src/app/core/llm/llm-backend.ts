import { InjectionToken, inject } from '@angular/core';
import { DESKTOP_API } from '../desktop/desktop-bridge';
import { BrowserLlmBackend } from './browser/browser-backend';
import { DesktopLlmBackend } from './desktop/desktop-backend';
import type { CompletionOptions, CompletionRequest, EngineDescriptor } from './engine.types';

/**
 * Where model calls physically run. `LlmService` is the only consumer; features
 * never see a backend (AGENTS.md §1.2).
 *
 * - Desktop (Electron): the main process probes and calls every engine, so there
 *   is no CORS to configure and the CLI agents (claude, opencode) are reachable.
 * - Browser (`ng serve`): `fetch` to the local servers only. No CLI agent can be
 *   reached from a page, which also means no résumé can leave through one.
 */
export interface LlmBackend {
  readonly kind: 'desktop' | 'browser';
  detect(): Promise<EngineDescriptor[]>;
  /** Resolves with the full answer text; rejects with an `LlmError`. */
  complete(request: CompletionRequest, options: CompletionOptions): Promise<string>;
}

export const LLM_BACKEND = new InjectionToken<LlmBackend>('LLM_BACKEND', {
  providedIn: 'root',
  factory: () => {
    const desktop = inject(DESKTOP_API);
    return desktop ? new DesktopLlmBackend(desktop) : new BrowserLlmBackend();
  },
});
