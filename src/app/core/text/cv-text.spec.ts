import { describe, expect, it } from 'vitest';
import { hasReadableContent, normaliseCvText } from './cv-text';

describe('normaliseCvText', () => {
  it('colapsa líneas en blanco, quita el final de línea y unifica los saltos', () => {
    expect(normaliseCvText('a  \r\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('conserva un salto simple dentro de un párrafo', () => {
    expect(normaliseCvText('uno\ndos')).toBe('uno\ndos');
  });

  it('convierte el espacio duro de un DOCX en un espacio normal', () => {
    // A .docx full of nbsp would otherwise reach the model as invisible glue.
    expect(normaliseCvText('Experiencia\u00a0en\u00a0Acme')).toBe('Experiencia en Acme');
  });

  it('quita el espacio al final de cada línea pero no la sangría', () => {
    // Indentation is structure: dropping it would flatten the CV's own layout.
    expect(normaliseCvText('  uno  \n\n\n\n  dos  ')).toBe('uno\n\n  dos');
  });

  it('recorta el principio y el final del texto', () => {
    expect(normaliseCvText('\n\n  cv  \n\n')).toBe('cv');
  });
});

describe('hasReadableContent', () => {
  it('descarta el texto que solo es espacio en blanco', () => {
    expect(hasReadableContent('  \n\t ')).toBe(false);
    expect(hasReadableContent('a')).toBe(true);
  });

  it('descarta un texto que solo lleva espacios duros', () => {
    // `\s` covers nbsp, so a DOCX of nothing but nbsp reads as empty rather
    // than as a page of invisible characters.
    expect(hasReadableContent('\u00a0\u00a0')).toBe(false);
  });
});
