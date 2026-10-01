import type { CompletionRequest, EngineDescriptor } from '../llm/engine.types';

/**
 * The contract between the Angular renderer and the Electron main process.
 *
 * `electron/preload.cjs` exposes exactly this object as `window.curriculae`, and
 * `electron/main.mjs` implements the other end of every call. Both JS files point
 * their JSDoc types here, so this file is the single source of truth for the IPC
 * surface: change it here first, then `npm run typecheck:desktop` tells you
 * which side is out of date.
 *
 * Everything crosses the bridge as structured-cloneable data — no class
 * instances, no functions except the listener and the unsubscribe it returns.
 */
export interface DesktopApi {
  readonly platform: string;
  readonly llm: DesktopLlmApi;
  readonly workspace: DesktopWorkspaceApi;
}

export interface DesktopLlmApi {
  /** Probes local servers and CLI agents. Never rejects: a dead engine is a status. */
  detect(): Promise<EngineDescriptor[]>;
  /**
   * Runs one completion in the main process and resolves with the full text.
   * Chunks arrive meanwhile through `onChunk`, tagged with the same `requestId`.
   * Rejects with an `Error` whose message starts with `[<LlmErrorCode>]`.
   */
  complete(requestId: string, request: CompletionRequest): Promise<string>;
  abort(requestId: string): void;
  onChunk(listener: (requestId: string, chunk: DesktopChunk) => void): () => void;
}

export interface DesktopChunk {
  readonly kind: 'content' | 'thinking';
  readonly text: string;
}

export interface DesktopWorkspaceApi {
  info(): Promise<WorkspaceInfo>;
  /** Opens a native folder picker; `null` when the user cancels. */
  chooseRoot(): Promise<WorkspaceInfo | null>;
  /** Opens the root, the CV folder, the offers folder or one generation folder in the file manager. */
  open(target: WorkspaceTarget): Promise<void>;
  /** Copies an uploaded base CV into the general CV folder. */
  saveCv(fileName: string, bytes: Uint8Array): Promise<SavedFile>;
  saveGeneration(input: NewGeneration): Promise<GenerationSummary>;
  listGenerations(): Promise<GenerationSummary[]>;
  readGeneration(id: string): Promise<GenerationDetail>;
  /** Writes an exported file (DOCX, MD…) into a generation folder. */
  saveExport(id: string, fileName: string, bytes: Uint8Array): Promise<SavedFile>;
  /** Renders a self-contained HTML document to an A4 PDF inside a generation folder. */
  exportPdf(id: string, fileName: string, html: string): Promise<SavedFile>;
}

export type WorkspaceTarget =
  | { readonly kind: 'root' }
  | { readonly kind: 'cvs' }
  | { readonly kind: 'offers' }
  | { readonly kind: 'generation'; readonly id: string };

export interface WorkspaceInfo {
  readonly root: string;
  readonly cvDir: string;
  readonly offersDir: string;
}

export interface SavedFile {
  readonly path: string;
  readonly fileName: string;
}

/** What the renderer hands over once a generation succeeded. */
export interface NewGeneration {
  readonly jobTitle: string | null;
  readonly company: string | null;
  readonly vacancyText: string;
  readonly adaptedCv: string;
  readonly baseCvFileName: string;
  readonly modelId: string;
  readonly modelLabel: string;
  /** The validated analysis, stored as-is in `analisis.json`. */
  readonly analysis: unknown;
  readonly unverified: readonly string[];
}

export interface GenerationSummary {
  /** The folder name inside `ofertas/`; also the id for every later call. */
  readonly id: string;
  readonly path: string;
  readonly createdAt: string;
  readonly jobTitle: string | null;
  readonly company: string | null;
  readonly modelLabel: string | null;
  readonly score: number | null;
}

export interface GenerationDetail extends GenerationSummary {
  readonly vacancyText: string;
  readonly adaptedCv: string;
  readonly baseCvFileName: string | null;
  readonly modelId: string | null;
  readonly analysis: unknown;
  readonly unverified: readonly string[];
  readonly files: readonly string[];
}
