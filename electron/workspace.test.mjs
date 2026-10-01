// @ts-check
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADAPTED_FILE,
  ANALYSIS_FILE,
  VACANCY_FILE,
  ensureWorkspace,
  generationFolderName,
  listGenerations,
  readGeneration,
  resolveGenerationDir,
  sanitizeFileName,
  saveCv,
  saveExport,
  saveGeneration,
  slugify,
} from './workspace.mjs';

/** @type {string} */
let root;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'curriculae-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const encoder = new TextEncoder();

/** @param {Partial<import('./workspace.mjs').NewGeneration>} overrides */
function generation(overrides = {}) {
  return {
    jobTitle: 'Desarrollador/a Frontend Angular Sr.',
    company: 'Acmé & Co',
    vacancyText: 'Buscamos Angular.\nRequisitos: TypeScript.',
    adaptedCv: '# Ana López\n\n- Angular',
    baseCvFileName: 'cv.pdf',
    modelId: 'ollama:qwen3.5:latest',
    modelLabel: 'qwen3.5 · Ollama',
    analysis: { score: 72, requirements: [] },
    unverified: ['Kubernetes'],
    ...overrides,
  };
}

describe('estructura de la carpeta de trabajo', () => {
  it('crea hojas-de-vida/ y ofertas/', async () => {
    const info = await ensureWorkspace(root);

    expect(await readdir(root)).toEqual(['hojas-de-vida', 'ofertas']);
    expect(info.cvDir).toBe(path.join(root, 'hojas-de-vida'));
    expect(info.offersDir).toBe(path.join(root, 'ofertas'));
  });
});

describe('hojas de vida cargadas', () => {
  it('guarda el archivo original en hojas-de-vida/', async () => {
    const saved = await saveCv(root, 'Mi CV.pdf', encoder.encode('%PDF-1'));

    expect(saved.fileName).toBe('Mi CV.pdf');
    expect(await readFile(path.join(root, 'hojas-de-vida', 'Mi CV.pdf'), 'utf8')).toBe('%PDF-1');
  });

  it('el mismo archivo dos veces no se duplica', async () => {
    await saveCv(root, 'cv.md', encoder.encode('# Ana'));
    const again = await saveCv(root, 'cv.md', encoder.encode('# Ana'));

    expect(again.fileName).toBe('cv.md');
    expect(await readdir(path.join(root, 'hojas-de-vida'))).toEqual(['cv.md']);
  });

  it('otro archivo con el mismo nombre recibe un sufijo', async () => {
    await saveCv(root, 'cv.md', encoder.encode('# Ana'));
    const second = await saveCv(root, 'cv.md', encoder.encode('# Ana v2'));

    expect(second.fileName).toBe('cv (2).md');
  });

  it('un nombre con ruta no puede salir de la carpeta', async () => {
    const saved = await saveCv(root, '../../etc/passwd', encoder.encode('x'));

    expect(saved.path).toBe(path.join(root, 'hojas-de-vida', 'passwd'));
  });
});

describe('carpetas por oferta', () => {
  it('nombra la carpeta con fecha, puesto y empresa en ASCII', () => {
    const name = generationFolderName(
      new Date(2026, 9, 1, 9, 5),
      'Desarrollador/a Frontend (Sr.)',
      'Acmé & Co',
    );
    expect(name).toBe('2026-10-01_0905-desarrollador-a-frontend-sr-acme-co');
    expect(generationFolderName(new Date(2026, 0, 2, 3, 4), null, null)).toBe(
      '2026-01-02_0304-oferta',
    );
  });

  it('escribe oferta.txt, la hoja de vida adaptada y el análisis', async () => {
    const summary = await saveGeneration(root, generation(), new Date(2026, 9, 1, 9, 30));
    const dir = path.join(root, 'ofertas', summary.id);

    expect((await readdir(dir)).sort()).toEqual([ANALYSIS_FILE, ADAPTED_FILE, VACANCY_FILE].sort());
    expect(await readFile(path.join(dir, VACANCY_FILE), 'utf8')).toBe(
      'Buscamos Angular.\nRequisitos: TypeScript.\n',
    );
    expect(await readFile(path.join(dir, ADAPTED_FILE), 'utf8')).toBe('# Ana López\n\n- Angular\n');
    const metadata = JSON.parse(await readFile(path.join(dir, ANALYSIS_FILE), 'utf8'));
    expect(metadata).toMatchObject({
      schemaVersion: 1,
      score: 72,
      baseCvFileName: 'cv.pdf',
      unverified: ['Kubernetes'],
    });
    expect(summary).toMatchObject({
      jobTitle: 'Desarrollador/a Frontend Angular Sr.',
      company: 'Acmé & Co',
      score: 72,
    });
  });

  it('dos generaciones en el mismo minuto no se pisan', async () => {
    const now = new Date(2026, 9, 1, 9, 30);
    const first = await saveGeneration(root, generation(), now);
    const second = await saveGeneration(root, generation(), now);

    expect(second.id).toBe(`${first.id}-2`);
  });

  it('rechaza un payload sin la vacante o la hoja de vida', async () => {
    await expect(
      saveGeneration(root, generation({ vacancyText: /** @type {any} */ (undefined) })),
    ).rejects.toThrow();
    await expect(
      saveGeneration(root, generation({ adaptedCv: /** @type {any} */ (42) })),
    ).rejects.toThrow();
  });

  it('lista las generaciones, la más reciente primero, y tolera carpetas hechas a mano', async () => {
    await saveGeneration(root, generation({ company: 'Vieja' }), new Date(2026, 0, 1));
    await saveGeneration(root, generation({ company: 'Nueva' }), new Date(2026, 5, 1));
    await mkdir(path.join(root, 'ofertas', 'carpeta-manual'));

    const list = await listGenerations(root);

    // The hand-made folder has no metadata, so its date is its mtime: now.
    expect(list.map((item) => item.company)).toEqual([null, 'Nueva', 'Vieja']);
    expect(list.find((item) => item.id === 'carpeta-manual')?.jobTitle).toBeNull();
  });

  it('lee una generación completa para previsualizarla', async () => {
    const summary = await saveGeneration(root, generation());
    const detail = await readGeneration(root, summary.id);

    expect(detail).toMatchObject({
      vacancyText: 'Buscamos Angular.\nRequisitos: TypeScript.',
      adaptedCv: '# Ana López\n\n- Angular',
      baseCvFileName: 'cv.pdf',
      unverified: ['Kubernetes'],
      analysis: { score: 72 },
    });
  });

  it('un analisis.json corrupto no impide leer la generación', async () => {
    const summary = await saveGeneration(root, generation());
    await writeFile(path.join(root, 'ofertas', summary.id, ANALYSIS_FILE), '{roto');

    const detail = await readGeneration(root, summary.id);
    expect(detail.adaptedCv).toContain('Ana López');
    expect(detail.analysis).toBeNull();
  });
});

describe('exportaciones', () => {
  it('escribe el archivo junto a la generación', async () => {
    const summary = await saveGeneration(root, generation());
    const saved = await saveExport(root, summary.id, 'ana-lopez.docx', encoder.encode('PK'));

    expect(saved.path).toBe(path.join(root, 'ofertas', summary.id, 'ana-lopez.docx'));
  });

  it('no permite extensiones arbitrarias ni sobrescribir los archivos de la generación', async () => {
    const summary = await saveGeneration(root, generation());

    await expect(saveExport(root, summary.id, 'virus.sh', encoder.encode('x'))).rejects.toThrow();
    await expect(saveExport(root, summary.id, VACANCY_FILE, encoder.encode('x'))).rejects.toThrow();
  });
});

describe('ids de carpeta', () => {
  it('rechaza cualquier id que intente salir de ofertas/', () => {
    for (const id of ['..', '../x', '/etc', 'a/b', '.oculta', '', 'A'.repeat(200), 'Mayúsculas']) {
      expect(() => resolveGenerationDir(root, id), id).toThrow();
    }
  });

  it('acepta un id generado por la app', () => {
    expect(resolveGenerationDir(root, '2026-10-01_0905-frontend-acme')).toBe(
      path.join(root, 'ofertas', '2026-10-01_0905-frontend-acme'),
    );
  });
});

describe('nombres', () => {
  it('sanitizeFileName quita separadores y caracteres reservados', () => {
    expect(sanitizeFileName('a<b>c:"d|e?*.pdf')).toBe('a_b_c_d_e_.pdf');
    expect(sanitizeFileName('..')).toBe('archivo');
    expect(sanitizeFileName('C:\\Users\\ana\\cv.pdf')).toBe('cv.pdf');
  });

  it('slugify quita tildes y símbolos', () => {
    expect(slugify('Ingeniería de Datos & IA')).toBe('ingenieria-de-datos-ia');
  });
});
