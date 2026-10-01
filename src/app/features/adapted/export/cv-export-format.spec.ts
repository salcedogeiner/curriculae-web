import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  exportFileName,
  renderCvDocx,
  renderCvHtml,
  renderCvPlainText,
} from './cv-export-format';

const CV = `# Ana López
ana@example.com

## Experiencia
### Dev — Smith & <Co> "Labs"
- Migré a **Angular**`;

describe('exportación', () => {
  it('nombra el archivo <nombre>-<puesto>-<empresa>, apto para cualquier sistema', () => {
    expect(exportFileName(CV, 'Desarrollador/a Sr.', 'Acmé & Co', 'pdf')).toBe(
      'ana-lopez-desarrollador-a-sr-acme-co.pdf',
    );
    expect(exportFileName('sin título', null, null, 'md')).toBe('hoja-de-vida.md');
  });

  it('escapa todo el texto interpolado en el HTML del PDF', () => {
    const html = renderCvHtml(CV);
    expect(html).toContain('Smith &amp; &lt;Co&gt; &quot;Labs&quot;');
    expect(html).not.toContain('<Co>');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<strong>Angular</strong>');
    expect(html).toContain('size: A4');
  });

  it('el HTML de un CV con marcado malicioso queda inerte', () => {
    expect(renderCvHtml('# <img src=x onerror=alert(1)>')).toContain(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('escapeHtml cubre comillas simples', () => {
    expect(escapeHtml("O'Brien")).toBe('O&#39;Brien');
  });

  it('genera un DOCX real (un ZIP con document.xml)', async () => {
    const bytes = await renderCvDocx(CV);
    // "PK": every .docx is a ZIP archive.
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('el texto plano para copiar no lleva marcas de Markdown', () => {
    const text = renderCvPlainText(CV);
    expect(text).toContain('ANA LÓPEZ');
    expect(text).toContain('• Migré a Angular');
    expect(text).not.toContain('**');
    expect(text).not.toContain('#');
  });
});
