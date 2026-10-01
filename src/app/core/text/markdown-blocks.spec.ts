import { describe, expect, it } from 'vitest';
import { documentTitle, parseInline, parseMarkdownBlocks } from './markdown-blocks';

describe('parseMarkdownBlocks', () => {
  const cv = [
    '# Ana López',
    'ana@example.com',
    '+57 300 000 0000',
    '',
    '## Experiencia',
    '### Dev — Acme (2020 – 2024)',
    '- Migré a **Angular 17**',
    '- Lideré un equipo',
    '  de 4 personas',
    '1. Uno',
    '2. Dos',
    '',
    '---',
  ].join('\n');

  it('reconoce títulos, párrafos con saltos de línea, listas y separadores', () => {
    const blocks = parseMarkdownBlocks(cv);

    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'heading',
      'list',
      'list',
      'rule',
    ]);
    const contact = blocks[1];
    expect(contact.kind === 'paragraph' && contact.lines).toHaveLength(2);
  });

  it('une la línea sangrada al elemento de lista anterior', () => {
    const list = parseMarkdownBlocks(cv)[4];
    expect(list.kind === 'list' && list.items[1].map((s) => s.text).join('')).toBe(
      'Lideré un equipo de 4 personas',
    );
  });

  it('separa listas ordenadas y no ordenadas', () => {
    const blocks = parseMarkdownBlocks(cv);
    expect(blocks[4].kind === 'list' && blocks[4].ordered).toBe(false);
    expect(blocks[5].kind === 'list' && blocks[5].ordered).toBe(true);
  });

  it('limita los niveles de título a 3', () => {
    const [block] = parseMarkdownBlocks('##### Muy hondo');
    expect(block.kind === 'heading' && block.level).toBe(3);
  });

  it('trata el HTML como texto, nunca como marcado', () => {
    const [block] = parseMarkdownBlocks('<img src=x onerror=alert(1)>');
    expect(block.kind === 'paragraph' && block.lines[0][0].text).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('ignora las vallas de código que algunos modelos añaden', () => {
    expect(parseMarkdownBlocks('```markdown\n# Ana\n```').map((b) => b.kind)).toEqual(['heading']);
  });

  it('el título del documento es el primer h1', () => {
    expect(documentTitle(parseMarkdownBlocks(cv))).toBe('Ana López');
    expect(documentTitle(parseMarkdownBlocks('## Sin nombre'))).toBeNull();
  });
});

describe('parseInline', () => {
  it('negrita, cursiva y código', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      { text: 'a ', strong: false, emphasis: false },
      { text: 'b', strong: true, emphasis: false },
      { text: ' ', strong: false, emphasis: false },
      { text: 'c', strong: false, emphasis: true },
      { text: ' ', strong: false, emphasis: false },
      { text: 'd', strong: false, emphasis: false },
    ]);
  });

  it('mantiene visible la URL de un enlace', () => {
    expect(parseInline('[GitHub](https://github.com/ana)')[0].text).toBe(
      'GitHub (https://github.com/ana)',
    );
  });

  it('no confunde snake_case con cursiva', () => {
    expect(parseInline('usa mi_variable_larga')).toHaveLength(1);
  });
});
