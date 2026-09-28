# Curriculae — instructions for coding agents

**Curriculae** is a local-first web app that tailors a résumé/CV to a specific job
vacancy. A job seeker supplies a base CV (pasted text, PDF, DOCX or Markdown) and
the text of a vacancy; the app asks a **locally running LLM** to extract what the
vacancy demands, compare it against the CV, report the gaps with a match score, and
produce an adapted CV that can be exported to PDF, DOCX or Markdown.

**Everything runs on the user's machine.** There is no backend, no account, no
telemetry and no API key. The résumé never leaves the device unless the user
explicitly opts into a cloud-backed agent engine (see §5).

Stack: **Angular 22.2** (standalone, zoneless, signals) + TypeScript + plain CSS +
Vitest. UI copy is **Spanish**; identifiers, comments and commits are **English**.

Read this file fully before changing anything.

---

## 0. Fast start

```bash
npm install
npm start                    # ng serve → http://localhost:4200
npm run build                # production build → dist/curriculae-web
npm test                     # vitest (jsdom)
npm run watch                # dev build, --watch
```

> **Not wired yet:** `presenteur`, the sibling project, uses a single
> `npm run check` gate (`format → lint → typecheck → test → build`) with ESLint and
> Prettier. That gate is the target for this repo but **does not exist yet** — until
> it lands, run `npm run build && npm test` before finishing any change.

- Node **24.21.0**, npm **11.19.0** (pinned via `packageManager`).
- Angular 22 renamed a lot of the last-3-years muscle memory. The app uses the
  **2025 file-name style guide**: `app.ts`, not `app.component.ts`. Prefer signals
  and the built-in control flow (`@if` / `@for` / `@let`) over `*ngIf` / `*ngFor` /
  `CommonModule`. There is **no `zone.js`** — change detection is signal-driven, so
  mutating a plain object does not repaint.

---

## 1. Golden rules (non-negotiable)

1. **Never let résumé data leave the machine implicitly.** Every call to a model
   goes through the `LlmService` facade and is tagged `local` or `agent`. A `local`
   engine (Ollama, llama.cpp) is the default and works offline. An `agent` engine
   (Claude, opencode, Codex) may forward the CV to a cloud provider and therefore
   requires an explicit, remembered, revocable opt-in plus a visible badge in the UI.
   A feature may never call a provider SDK directly and skip this gate.
2. **The quality gate ships with the change.** A change that breaks the build or the
   tests is unfinished.
3. **All user-facing strings are Spanish**, including validation messages, empty
   states, `aria-label`s and error text. Keep them behind the i18n layer (§6) rather
   than hardcoding them in templates, so a second language is a config change.
4. **Zero new runtime dependencies without approval.** The declared purpose of each
   dependency is listed in §8. Ask before adding another; the résumé app should stay
   small and fast to start.
5. **Never commit secrets, `.env*` files or local model artefacts.** The app has no
   secrets by design — it talks to `127.0.0.1`. If a cloud engine is ever configured,
   its credential belongs in the user's own tool config, never in this repo.
6. **Persistence is `localStorage`, scoped and versioned.** The stored résumé and
   preferences live under a single namespaced, schema-versioned key so a future
   migration is possible. Never cache full CV text in `sessionStorage` or in a
   module-level constant.
7. **Do not delete or rewrite files outside the scope of the task.** Check
   `git log` before removing anything; it may be someone's in-progress work.

---

## 2. Repository map (current state)

```
AGENTS.md                    ← this file
.agents/skills/              ← reserved for portable skills (<id>/SKILL.md)
src/
  main.ts                    bootstrapApplication(App, appConfig)
  index.html                 <app-root>, lang="es" TODO
  styles.css                 global styles + design tokens (CSS custom properties)
  app/
    app.ts / app.html / app.css   root component; app.html is still the ~20 kB
                                 CLI placeholder and MUST be replaced
    app.config.ts            providers: provideBrowserGlobalErrorListeners, provideRouter
    app.routes.ts            empty; wire the feature routes here
    app.spec.ts              2 passing smoke tests
angular.json  package.json  tsconfig*.json  .prettierrc  .editorconfig
.vscode/                     launch, tasks, extensions
```

## 3. Target architecture

Not built yet — create it as the features land, in this order.

```
src/app/
  core/
    llm/                     THE ONLY place that talks to a model
      engine.types.ts        EngineKind, EngineDescriptor, EngineTier, ChatMessage
      local/ollama.adapter.ts, llamacpp.adapter.ts
      agent/claude.adapter.ts, opencode.adapter.ts, codex.adapter.ts
      detection/probe.ts     port/base-URL probing with timeout + abort
      llm.service.ts         facade: detect(), listModels(), complete()
    storage/                 versioned localStorage repository
    i18n/                    Spanish message catalogue
  features/
    cv/                      load + manage the base résumé (paste / PDF / DOCX / MD)
    vacancy/                 paste and hold the vacancy text
    analysis/                match score + gap report
    adapted/                 adapted CV preview + export
    settings/                engine selection, consent, model picker
  shared/ui/                 presentational components only
```

Rules: features are lazy-loaded routes; `shared/ui` holds no business logic and no
engine calls; every adapter implements one narrow interface so adding a backend never
touches a feature.

---

## 4. The flow to build

1. **Base CV** — paste text, or upload PDF / DOCX / Markdown. Parsed once, stored in
   `localStorage`, reused across vacancies.
2. **Vacancy** — the user pastes the full description text.
3. **Analyze** — one LLM call returns a structured result: the requirements the
   vacancy asks for, a per-requirement match verdict, the gaps, and a 0–100 match
   score. The model must answer with **JSON**, validated in the app before it is
   trusted; never render raw model output as HTML.
4. **Adapt** — a second LLM call rewrites the CV section by section to address the
   gaps. **Never invent facts**: the adapted CV may reorder, reword and emphasise
   existing experience, but it may not add employers, dates, degrees or skills the
   user never supplied. That is a hard product rule, not a style preference.
5. **Export** — PDF, DOCX, Markdown, or copy to clipboard.

---

## 5. Model engines: what actually exists locally

Verified on the dev machine on 2026-09-28. Do not assume these stay available —
always probe, never hardcode a port.

### Tier `local` — the résumé stays on the device (default)

| Engine                    | Endpoint                 | Notes                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ollama**                | `http://127.0.0.1:11434` | Running. `GET /` → `Ollama is running`; `GET /api/tags` → native list; `GET /v1/models` → OpenAI-compatible list. Installed model: `qwen3.5:latest` (9.7 B, Q4_K_M, 262 144 ctx, `tools` + `vision`). Prefer the native `/api/chat`; fall back to `/v1/chat/completions`. |
| **llama.cpp / llamafile** | `http://127.0.0.1:8080`  | `llama-server` and `llamafile` speak the OpenAI API. Not installed on the dev machine.                                                                                                                                                                                    |

### Tier `agent` — may forward the CV to a cloud provider (opt-in required)

| Tool         | Integration                                                                                                                                                     | Reality                                                                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **opencode** | background service, `opencode service status` → `http://127.0.0.1:<port>`, API under `/api/*`, OpenAPI at `/openapi.json`. Also `opencode serve --port --cors`. | **The port is dynamic** (observed `:49374`, v2.0.16) — probe, never assume 4096. Whether the CV stays local depends entirely on the model/provider opencode is configured with.                                                     |
| **Claude**   | `claude -p "<prompt>" --output-format json` (headless).                                                                                                         | **Cloud: Anthropic.** Requires `/login`; without it the call fails with `Not logged in · Please run /login`. Spinning up a subprocess from the browser is not possible — this engine needs a bridge, so treat it as a stretch goal. |
| **Codex**    | —                                                                                                                                                               | Not installed on the dev machine. Verify the real local interface before writing an adapter.                                                                                                                                        |

**Detection**: probe a short list of known bases (`11434`, `8080`, `1234`, plus the
opencode service URL) in parallel with a ~1 s timeout and an `AbortController`; merge
with the user's saved preference. A probe failure is a normal, silent outcome — the
app must degrade to "no engine found" with a helpful message, never a crash or a
spinner that never resolves.

**CORS is the #1 local-mode bug.** The app is served from `http://localhost:4200`
and calls other origins, so the model server must allow it: Ollama needs
`OLLAMA_ORIGINS='*'`, `opencode serve` needs `--cors http://localhost:4200`, and
llama.cpp needs its host/origin flags. Document this in the UI as a setup hint the
first time a probe fails — it is invisible otherwise.

---

## 6. Conventions

### Angular 22

- **Standalone only.** No `NgModule`. Declare what a component needs in its own
  `imports`. Add a dependency with `ng add <lib>`, never by hand-editing.
- **Signals everywhere.** `signal()` for state, `computed()` for derived values,
  `input()` / `output()` instead of decorators. Components are `ChangeDetectionStrategy.OnPush`.
- **Built-in control flow**: `@if`, `@for` (with `track`), `@switch`, `@defer`.
- **Modern DI**: `inject()`, never constructor injection.
- **Routing**: lazy `loadComponent` per feature; the root component renders
  `<router-outlet />` and nothing else.
- Reactive forms (`FormBuilder`, typed forms) for the vacancy and résumé forms.

### Styling (plain CSS)

- Global design tokens live in `src/styles.css` as custom properties
  (`--color-surface`, `--color-text-muted`, `--color-accent`, spacing, radii).
  **Consume tokens, never raw hex or a one-off colour.**
- Component styles are `app.css`-style per-component files with Angular's emulated
  encapsulation; no `::ng-deep`, no global selectors from a component.
- The CV preview must print cleanly: a dedicated `@media print` stylesheet, white
  background, no fixed heights, and page-break control inside work items.
- Accessible by default: visible focus ring, real `<label for>`, `aria-live` for
  async results, `prefers-reduced-motion` respected.

### Testing

- **Vitest** + jsdom (the Angular 22 default; Karma is not installed). Tests live
  next to the code they cover, `*.spec.ts`.
- Adapters are the easiest and most valuable thing to test: assert the probe against a
  mocked `fetch`, the JSON validation against malformed model output, and the
  no-invented-facts rule with a fixture.
- If behaviour changes, the tests change in the same commit. The tests are the
  executable form of §1.

### i18n

UI strings are Spanish and must not be hardcoded in templates. Centralise them in
the i18n layer and reference them by key, so adding a locale later is a file
addition. `lang="es"` in `index.html`.

### Git

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.
- One logical change per commit; a partial commit is better named `WIP` than faked.
- Branch `main`; repo-local identity `salcedogeiner <geiner.salcedo.ppc0111@gmail.com>`.

---

## 7. Gotchas specific to this codebase

- The app **runs locally and is not deployed**; `ng serve` over plain HTTP is the
  target environment. Do not add SSR, a service worker, or telemetry "for later".
- The `anyComponentStyle` budget is **4 kB warning / 8 kB error**. The CV preview and
  print stylesheet will hit this first — split the styles or raise the budget
  deliberately, never by accident.
- `src/app/app.html` is the Angular CLI welcome placeholder (~20 kB of inline SVG).
  Replace it in the first UI commit; do not build on top of it.
- Ollama's `qwen3.5` is a **thinking** model: it emits reasoning tokens before the
  answer, so stream the response and never assume a non-streamed reply is complete.
  Keep JSON instructions in the system prompt and tolerate leading prose.
- A `local` model on a laptop can take 10–60 s for a full CV rewrite. The UI must show
  progress and allow cancel via `AbortController`; a frozen screen is a bug.
- Anything the user typed is untrusted input on re-render: never `innerHTML` model or
  vacancy text, and escape it in the exported PDF/DOCX.
- The stored CV may be from an older schema version. `storage/` must detect the
  version and migrate or discard — never throw on read.

---

## 8. Approved dependencies

Runtime dependencies beyond the Angular baseline (`@angular/*`, `rxjs`, `tslib`).
Anything not on this list needs approval first (§1.4).

| Package      | Purpose                                          |
| ------------ | ------------------------------------------------ |
| `pdfjs-dist` | Extract text from an uploaded base CV (PDF).     |
| `mammoth`    | Extract text from an uploaded base CV (DOCX).    |
| `marked`     | Render/parse Markdown input and Markdown export. |
| `jspdf`      | Export the adapted CV to PDF.                    |
| `docx`       | Export the adapted CV to editable DOCX.          |

Notes: `pdfjs-dist` needs its worker wired for the bundler — prefer
`pdfjs-dist/build/pdf.worker.min.mjs` via `GlobalWorkerOptions.workerSrc`, and watch
the `initial` budget (500 kB warning / 1 MB error) once these land. `marked` output
is **untrusted**: sanitise before rendering, never pipe it into `innerHTML`.
