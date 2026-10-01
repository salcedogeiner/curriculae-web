import { InjectionToken } from '@angular/core';
import type { DesktopApi } from './desktop-api';

declare global {
  interface Window {
    /** Present only inside the Electron shell (electron/preload.cjs). */
    readonly curriculae?: DesktopApi;
  }
}

/**
 * The desktop bridge, or `null` when the app runs in a plain browser (`ng serve`).
 *
 * Injected rather than read from `window` at each call site, so a test can hand
 * a fake bridge to any service and the browser fallback stays the default.
 */
export const DESKTOP_API = new InjectionToken<DesktopApi | null>('DESKTOP_API', {
  providedIn: 'root',
  factory: () => (typeof window !== 'undefined' ? (window.curriculae ?? null) : null),
});
