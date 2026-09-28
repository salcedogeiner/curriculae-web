import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18n } from './i18n';

describe('I18n', () => {
  let i18n: I18n;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    i18n = TestBed.inject(I18n);
  });

  it('resuelve una clave con puntos hasta el texto', () => {
    expect(i18n.t('cv.dropzone.legend')).toBe('Cargar la hoja de vida base');
  });

  it('interpola un parámetro de texto', () => {
    expect(i18n.t('cv.dropzone.reading', { fileName: 'cv.pdf' })).toBe('Leyendo cv.pdf…');
  });

  it('formatea un número con el separador de miles español', () => {
    const text = i18n.t('cv.dropzone.loaded', {
      fileName: 'cv.md',
      chars: 25_000,
      format: 'Markdown',
    });

    // 25.000, not 25000: the UI copy is Spanish (AGENTS.md §1.4).
    expect(text).toBe('Hoja de vida cargada: cv.md · 25.000 caracteres · Markdown');
  });

  it('deja intacto un texto ya formateado, como el tamaño de un archivo', () => {
    // The comma here is the Spanish decimal mark, produced by humanFileSize.
    expect(i18n.t('cv.dropzone.formats', { formats: 'PDF, DOCX', maxSize: '8,0 MB' })).toContain(
      'Máximo 8,0 MB.',
    );
  });

  it('deja el marcador visible si falta un parámetro, en vez de dejar un hueco', () => {
    // A visible "{fileName}" is a bug report; an empty gap is a silent mystery.
    expect(i18n.t('cv.preview.meta', { chars: 100 })).toBe('100 caracteres extraídos de {fileName}');
  });

  it('lanza si la clave no existe, en vez de renderizar la clave en pantalla', () => {
    expect(() => i18n.t('cv.stepTitleX' as never)).toThrow(/cv\.stepTitleX/);
  });

  it('lanza si la clave apunta a un grupo y no a un texto', () => {
    expect(() => i18n.t('cv.preview' as never)).toThrow(/cv\.preview/);
  });
});
