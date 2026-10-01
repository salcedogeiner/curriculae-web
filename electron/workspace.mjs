// @ts-check
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The user's workspace on disk. Folder and file names are Spanish because the
 * user browses them in their own file manager:
 *
 *   <raíz>/
 *     hojas-de-vida/                 every base CV loaded, as the original file
 *     ofertas/
 *       2026-10-01_0930-desarrollador-angular-acme/
 *         oferta.txt                 the vacancy exactly as pasted
 *         hoja-de-vida-adaptada.md   the generated CV
 *         analisis.json              analysis, model, base CV, unverified terms
 *         *.pdf / *.docx / *.md      exports, when the user makes them
 *
 * Everything here takes plain arguments and touches only the filesystem, so it
 * is unit-tested against a temp directory (workspace.test.mjs). The renderer is
 * not trusted with paths: it names a generation by its folder id, and every id
 * and file name is validated and resolved inside the workspace.
 */

/** @typedef {import('../src/app/core/desktop/desktop-api').WorkspaceInfo} WorkspaceInfo */
/** @typedef {import('../src/app/core/desktop/desktop-api').NewGeneration} NewGeneration */
/** @typedef {import('../src/app/core/desktop/desktop-api').GenerationSummary} GenerationSummary */
/** @typedef {import('../src/app/core/desktop/desktop-api').GenerationDetail} GenerationDetail */
/** @typedef {import('../src/app/core/desktop/desktop-api').SavedFile} SavedFile */

export const CV_DIR = 'hojas-de-vida';
export const OFFERS_DIR = 'ofertas';
export const VACANCY_FILE = 'oferta.txt';
export const ADAPTED_FILE = 'hoja-de-vida-adaptada.md';
export const ANALYSIS_FILE = 'analisis.json';
export const METADATA_VERSION = 1;

const EXPORT_EXTENSIONS = new Set(['.pdf', '.docx', '.md', '.txt']);
const GENERATION_ID = /^[a-z0-9][a-z0-9_-]{0,119}$/;
const MAX_TEXT_CHARS = 200_000;

/**
 * @param {string} root
 * @returns {Promise<WorkspaceInfo>}
 */
export async function ensureWorkspace(root) {
  const info = describeWorkspace(root);
  await mkdir(info.cvDir, { recursive: true });
  await mkdir(info.offersDir, { recursive: true });
  return info;
}

/**
 * @param {string} root
 * @returns {WorkspaceInfo}
 */
export function describeWorkspace(root) {
  const resolved = path.resolve(root);
  return {
    root: resolved,
    cvDir: path.join(resolved, CV_DIR),
    offersDir: path.join(resolved, OFFERS_DIR),
  };
}

/**
 * A file name safe on Linux, macOS and Windows: no separators, no reserved
 * characters, no leading dots, bounded length.
 *
 * @param {string} name
 */
export function sanitizeFileName(name) {
  const base = path.basename(String(name).replace(/\\/g, '/'));
  const clean = base
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120);
  return clean === '' ? 'archivo' : clean;
}

/**
 * ASCII slug for folder names: "Desarrollador/a Angular (Sr.)" → "desarrollador-a-angular-sr".
 *
 * @param {string | null | undefined} text
 * @param {number} max
 */
export function slugify(text, max = 40) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/**
 * Saves an uploaded CV under `hojas-de-vida/`. Loading the same file twice
 * reuses it; a different file with the same name gets " (2)", " (3)"…
 *
 * @param {string} root
 * @param {string} fileName
 * @param {Uint8Array} bytes
 * @returns {Promise<SavedFile>}
 */
export async function saveCv(root, fileName, bytes) {
  const { cvDir } = await ensureWorkspace(root);
  const safe = sanitizeFileName(fileName);
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  const digest = sha256(bytes);

  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? safe : `${stem} (${n})${ext}`;
    const full = path.join(cvDir, candidate);
    try {
      await writeFile(full, bytes, { flag: 'wx' });
      return { path: full, fileName: candidate };
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') {
        throw error;
      }
      if (sha256(await readFile(full)) === digest) {
        return { path: full, fileName: candidate };
      }
    }
  }
  throw new Error('Demasiados archivos con el mismo nombre');
}

/**
 * @param {Date} date
 * @param {string | null} jobTitle
 * @param {string | null} company
 */
export function generationFolderName(date, jobTitle, company) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`;
  const label = [slugify(jobTitle), slugify(company, 30)].filter(Boolean).join('-') || 'oferta';
  return `${stamp}-${label}`;
}

/**
 * Creates the folder of one tailored CV and writes its three files.
 *
 * @param {string} root
 * @param {NewGeneration} input
 * @param {Date} [now]
 * @returns {Promise<GenerationSummary>}
 */
export async function saveGeneration(root, input, now = new Date()) {
  const generation = validateGeneration(input);
  const { offersDir } = await ensureWorkspace(root);
  const base = generationFolderName(now, generation.jobTitle, generation.company);

  let id = base;
  for (let n = 2; ; n++) {
    try {
      await mkdir(path.join(offersDir, id));
      break;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST' || n > 999) {
        throw error;
      }
      id = `${base}-${n}`;
    }
  }

  const dir = path.join(offersDir, id);
  const createdAt = now.toISOString();
  const analysis = /** @type {{ score?: unknown }} */ (generation.analysis);
  const metadata = {
    schemaVersion: METADATA_VERSION,
    createdAt,
    jobTitle: generation.jobTitle,
    company: generation.company,
    baseCvFileName: generation.baseCvFileName,
    modelId: generation.modelId,
    modelLabel: generation.modelLabel,
    score: typeof analysis?.score === 'number' ? analysis.score : null,
    unverified: generation.unverified,
    analysis: generation.analysis,
  };

  await writeFile(path.join(dir, VACANCY_FILE), `${generation.vacancyText}\n`, 'utf8');
  await writeFile(path.join(dir, ADAPTED_FILE), `${generation.adaptedCv}\n`, 'utf8');
  await writeFile(path.join(dir, ANALYSIS_FILE), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  return toSummary(id, dir, metadata);
}

/**
 * Newest first. A folder without a readable `analisis.json` (the user dropped
 * something in by hand) is listed from its name rather than hidden or fatal.
 *
 * @param {string} root
 * @returns {Promise<GenerationSummary[]>}
 */
export async function listGenerations(root) {
  const { offersDir } = await ensureWorkspace(root);
  const entries = await readdir(offersDir, { withFileTypes: true });
  const summaries = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && GENERATION_ID.test(entry.name))
      .map(async (entry) => {
        const dir = path.join(offersDir, entry.name);
        const metadata = await readMetadata(dir);
        const createdAt = metadata?.createdAt ?? (await stat(dir)).mtime.toISOString();
        return toSummary(entry.name, dir, { ...metadata, createdAt });
      }),
  );
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * @param {string} root
 * @param {string} id
 * @returns {Promise<GenerationDetail>}
 */
export async function readGeneration(root, id) {
  const dir = resolveGenerationDir(root, id);
  const metadata = (await readMetadata(dir)) ?? {};
  const createdAt = metadata.createdAt ?? (await stat(dir)).mtime.toISOString();
  const [vacancyText, adaptedCv, files] = await Promise.all([
    readFile(path.join(dir, VACANCY_FILE), 'utf8').catch(() => ''),
    readFile(path.join(dir, ADAPTED_FILE), 'utf8'),
    readdir(dir),
  ]);
  return {
    ...toSummary(id, dir, { ...metadata, createdAt }),
    vacancyText: vacancyText.trim(),
    adaptedCv: adaptedCv.trim(),
    baseCvFileName: stringOrNull(metadata.baseCvFileName),
    modelId: stringOrNull(metadata.modelId),
    analysis: metadata.analysis ?? null,
    unverified: Array.isArray(metadata.unverified)
      ? metadata.unverified.filter((term) => typeof term === 'string')
      : [],
    files: files.sort(),
  };
}

/**
 * Writes an export next to the generation's files, replacing an older export
 * with the same name.
 *
 * @param {string} root
 * @param {string} id
 * @param {string} fileName
 * @param {Uint8Array} bytes
 * @returns {Promise<SavedFile>}
 */
export async function saveExport(root, id, fileName, bytes) {
  const full = resolveExportPath(root, id, fileName);
  await writeFile(full, bytes);
  return { path: full, fileName: path.basename(full) };
}

/**
 * @param {string} root
 * @param {string} id
 * @param {string} fileName
 */
export function resolveExportPath(root, id, fileName) {
  const dir = resolveGenerationDir(root, id);
  const safe = sanitizeFileName(fileName);
  if (!EXPORT_EXTENSIONS.has(path.extname(safe).toLowerCase())) {
    throw new Error(`Tipo de archivo no permitido: ${safe}`);
  }
  if ([VACANCY_FILE, ADAPTED_FILE, ANALYSIS_FILE].includes(safe)) {
    throw new Error(`No se puede sobrescribir ${safe}`);
  }
  return path.join(dir, safe);
}

/**
 * The only way from an id to a path: a strict pattern, then a containment
 * check, so `../` or an absolute path can never escape `ofertas/`.
 *
 * @param {string} root
 * @param {string} id
 */
export function resolveGenerationDir(root, id) {
  if (typeof id !== 'string' || !GENERATION_ID.test(id)) {
    throw new Error('Identificador de carpeta no válido');
  }
  const { offersDir } = describeWorkspace(root);
  const dir = path.resolve(offersDir, id);
  if (path.dirname(dir) !== offersDir) {
    throw new Error('Identificador de carpeta no válido');
  }
  return dir;
}

/* ── helpers ─────────────────────────────────────────────────── */

/** @param {Uint8Array} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {unknown} value */
function stringOrNull(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * @param {string} dir
 * @returns {Promise<Record<string, any> | null>}
 */
async function readMetadata(dir) {
  try {
    const parsed = JSON.parse(await readFile(path.join(dir, ANALYSIS_FILE), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {string} dir
 * @param {Record<string, any>} metadata
 * @returns {GenerationSummary}
 */
function toSummary(id, dir, metadata) {
  return {
    id,
    path: dir,
    createdAt: String(metadata['createdAt']),
    jobTitle: stringOrNull(metadata['jobTitle']),
    company: stringOrNull(metadata['company']),
    modelLabel: stringOrNull(metadata['modelLabel']),
    score: typeof metadata['score'] === 'number' ? metadata['score'] : null,
  };
}

/**
 * The renderer's payload, checked field by field before it touches the disk.
 *
 * @param {unknown} value
 * @returns {NewGeneration}
 */
export function validateGeneration(value) {
  const input = /** @type {Record<string, unknown>} */ (value ?? {});
  const text = (/** @type {string} */ key, required = false) => {
    const field = input[key];
    if (field === null || field === undefined) {
      if (required) {
        throw new Error(`Falta ${key}`);
      }
      return null;
    }
    if (typeof field !== 'string' || field.length > MAX_TEXT_CHARS) {
      throw new Error(`${key} no es válido`);
    }
    return field;
  };
  const unverified = Array.isArray(input['unverified'])
    ? input['unverified'].filter((term) => typeof term === 'string').slice(0, 100)
    : [];

  return {
    jobTitle: text('jobTitle'),
    company: text('company'),
    vacancyText: /** @type {string} */ (text('vacancyText', true)),
    adaptedCv: /** @type {string} */ (text('adaptedCv', true)),
    baseCvFileName: text('baseCvFileName') ?? '',
    modelId: text('modelId') ?? '',
    modelLabel: text('modelLabel') ?? '',
    analysis: input['analysis'] ?? null,
    unverified,
  };
}
