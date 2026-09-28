import { Injectable, signal } from '@angular/core';
import { es, type Catalogue, type MessageKey, type MessageParams } from './messages';

export type Locale = 'es';

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Locale holder. Templates must call `t('key')` and never hardcode Spanish copy
 * (AGENTS.md §1.4, §7). A second language is a new catalogue plus one entry here.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly locale = signal<Locale>('es');

  private readonly catalogues: Readonly<Record<Locale, Catalogue>> = { es };
  private readonly formatters = new Map<Locale, Intl.NumberFormat>();

  /** Resolves a dotted key, interpolating `{placeholders}`. Unknown keys throw in dev. */
  t(key: MessageKey, params?: MessageParams): string {
    const value = this.#lookup(this.catalogues[this.locale()], key);

    if (typeof value !== 'string') {
      throw new Error(`[i18n] La clave "${key}" no existe o no es un texto.`);
    }

    if (!params) {
      return value;
    }

    const locale = this.locale();
    return value.replace(PLACEHOLDER, (match, name: string) => {
      if (!(name in params)) {
        return match;
      }
      const param = params[name];
      // A number is formatted here, with the active locale, so that no call
      // site has to remember that Spanish writes 25.000 and not 25000. Strings
      // arrive pre-formatted (file sizes, format lists) and pass through.
      return typeof param === 'number' ? this.#numberFormat(locale).format(param) : param;
    });
  }

  #numberFormat(locale: Locale): Intl.NumberFormat {
    let formatter = this.formatters.get(locale);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale);
      this.formatters.set(locale, formatter);
    }
    return formatter;
  }

  #lookup(node: object, key: string): unknown {
    return key.split('.').reduce<unknown>((acc, part) => {
      if (acc === null || typeof acc !== 'object') {
        return undefined;
      }
      return (acc as Record<string, unknown>)[part];
    }, node);
  }
}
