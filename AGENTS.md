# Curriculae — instructions for coding agents

**Curriculae** is a local-first web app that tailors a résumé/CV to a specific job
vacancy. A job seeker supplies a base CV (pasted text, PDF, DOCX or Markdown) and
the text of a vacancy; the app asks a **locally running LLM** to extract what the
vacancy demands, compare it against the CV, report the gaps with a match score, and
produce an adapted CV that can be exported to PDF, DOCX or Markdown.

**Everything runs on the user's machine.** There is no backend, no account, no
telemetry and no API key. It ships as a **desktop app (Electron)** — the primary
target — and still runs as a plain web page under `ng serve`. The résumé never leaves the device unless the user
explicitly opts into a cloud-backed agent engine (see §5 and the `llm-integration`
skill).

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
npm run desktop              # production build + Electron window
npm run desktop:dev          # ng serve + Electron on it (live reload)
npm run test:desktop         # vitest for electron/ (Node environment)
npm run typecheck:desktop    # tsc --checkJs over electron/ against desktop-api.ts
npm run dist                 # package for the current OS into release/
```

Releases: pushing a `v*` tag runs `.github/workflows/release.yml` (gate → one
build per OS → GitHub Release with the installers). Tagging is publishing: it
falls under §1.1 — only when the user asks for a release.

> **Not wired yet:** `presenteur`, the sibling project, uses a single
> `npm run check` gate (`format → lint → typecheck → test → build`) with ESLint and
> Prettier. That gate is the target for this repo but **does not exist yet** — until
> it lands, run `npm run build && npm test && npm run test:desktop && npm run
> typecheck:desktop` before finishing any change.

- Node **24.21.0**, npm **11.19.0** (pinned via `packageManager`).
- Angular 22 renamed a lot of the last-3-years muscle memory. The app uses the
  **2025 file-name style guide**: `app.ts`, not `app.component.ts`. Prefer signals
  and the built-in control flow (`@if` / `@for` / `@let`) over `*ngIf` / `*ngFor` /
  `CommonModule`. There is **no `zone.js`** — change detection is signal-driven, so
  mutating a plain object does not repaint.

---

## 1. Golden rules (non-negotiable)

1. **Never commit without the user's review.** Leave every change in the working
   tree, uncommitted, and say what changed. The user reviews and decides when to
   commit. Do not run `git commit`, do not `git add` on the user's behalf beyond what
   is needed to show a diff, and never amend, rebase, reset, push, or rewrite history
   unless explicitly asked in that same request. "Implement X" is not permission to
   commit; only "commit" is.
2. **Never let résumé data leave the machine implicitly.** Every call to a model
   goes through the `LlmService` facade and is tagged `local` or `agent`. A `local`
   engine (Ollama, llama.cpp) is the default and works offline. An `agent` engine
   (Claude, opencode, Codex) may forward the CV to a cloud provider and therefore
   requires an explicit, remembered, revocable opt-in plus a visible badge in the UI.
   A feature may never call a provider SDK directly and skip this gate.
3. **The quality gate ships with the change.** A change that breaks the build or the
   tests is unfinished.
4. **All user-facing strings are Spanish**, including validation messages, empty
   states, `aria-label`s and error text. Keep them behind the i18n layer (§7) rather
   than hardcoding them in templates, so a second language is a config change.
5. **Zero new runtime dependencies without approval.** The declared purpose of each
   dependency is listed in §9. Ask before adding another; the résumé app should stay
   small and fast to start.
6. **Never commit secrets, `.env*` files or local model artefacts.** The app has no
   secrets by design — it talks to `127.0.0.1`. If a cloud engine is ever configured,
   its credential belongs in the user's own tool config, never in this repo.
7. **Persistence is `localStorage`, scoped and versioned.** The stored résumé and
   preferences live under a single namespaced, schema-versioned key so a future
   migration is possible. Never cache full CV text in `sessionStorage` or in a
   module-level constant.
8. **Do not delete or rewrite files outside the scope of the task.** Check
   `git log` before removing anything; it may be someone's in-progress work.
9. **Load the relevant skill instead of improvising.** The detailed procedures live
   in `.agents/skills/` (§6). This file is the mental model; the skills are the
   playbooks.

---

## 2. Repository map (current state)

```
AGENTS.md                    ← this file: the mental model and the rules
.agents/skills/              ← portable playbooks (<id>/SKILL.md, optional
│                                references/). Load the relevant one, §6.
electron/                    the desktop shell (plain ESM + JSDoc, @ts-check)
  main.mjs                   window, app:// protocol, IPC handlers, hardening
  preload.cjs                exposes exactly DesktopApi as window.curriculae
  app-protocol.mjs           serves dist/ from app://curriculae with a strict CSP
  workspace.mjs              the on-disk workspace (hojas-de-vida/, ofertas/)
  config.mjs                 userData/config.json (workspace location)
  engines/                   engine registry: Ollama, llama.cpp, LM Studio over
                             HTTP; claude and opencode CLIs as subprocesses
  launch.mjs                 npm run desktop / desktop:dev; sandbox detection
build/icon.png               app icon (electron-builder derives .ico/.icns)
.github/workflows/release.yml   v* tag → executables for Windows, macOS, Linux
  *.test.mjs                 vitest, Node environment (npm run test:desktop)
src/
  main.ts                    bootstrapApplication(App, appConfig)
  index.html                 <app-root>, lang="es"
  styles.css                 global styles + design tokens (light/dark)
  testing/fake-llm.ts        test doubles for the model layer (specs only)
  app/
    app.ts / app.html / app.css   shell: skip link, site title, <router-outlet>
    app.routes.ts            home route → pages/home (lazy)
    core/
      desktop/               desktop-api.ts — THE IPC contract, typed once;
                             desktop-bridge.ts — DESKTOP_API token (null in browser)
      llm/                   the only place that talks to a model (§5)
        engine.types.ts      tiers, engines, models, requests, LlmError codes
        llm.service.ts       facade: detect(), select(), consent gate, complete()
        llm-backend.ts       LLM_BACKEND token: desktop (IPC) or browser (fetch)
        browser/             Ollama + OpenAI-compatible adapters over fetch
        desktop/             IPC backend: chunks, abort, error codes
        json-response.ts     defensive JSON extraction from model answers
      i18n/                  messages.ts (Spanish catalogue) + i18n.ts
      storage/               cv.repository.ts; preferences.repository.ts (model,
                             agent consent, vacancy draft) on versioned-store.ts
      text/                  cv-text.ts, markdown-blocks.ts (safe MD → data),
                             fold.ts (comparison form), prompt-data.ts (tagging)
      workspace/             workspace.service.ts — desktop folder ops as signals
    features/
      cv/                    step 1: dropzone, preview, import pipeline
      vacancy/               vacancy.service.ts — the pasted text, persisted draft
      settings/model-selector/   detected models, privacy badge, agent consent
      analysis/              JSON contract + validator, prompt, report component
      adapted/               adaptation prompt, fact-check (no invented facts),
                             preview component, export (PDF/DOCX/MD) + actions
      generation/            orchestrator service, the right-column form, the
                             result section
      history/               desktop: workspace folders and past generations
    pages/
      home/                  cv-home.* — composition only: CV left, generation
                             form right, result and history below
angular.json  package.json  tsconfig*.json  .prettierrc  .editorconfig
```

Runtime dependencies: `pdfjs-dist` (PDF text), `mammoth` (DOCX text) and `docx`
(DOCX export), all `import()`ed on demand so they stay out of the `initial`
bundle. `pdfjs-dist` is pinned to 5.7.x on purpose — 6.x requires
`Uint8Array.prototype.toHex`; see the comment in `cv-parser.ts`. `electron` is a
devDependency: it is the shell, not part of the web bundle. `marked` and `jspdf`
are approved but unused: Markdown is parsed by `core/text/markdown-blocks.ts`
(data, never HTML), and the PDF is rendered by Electron's `printToPDF` (desktop)
or the print dialog (browser) from the same escaped HTML.

## 3. Target architecture

All five steps of §4 are built (see §2). This is the shape to keep; it now also
includes `core/desktop`, `core/workspace`, `features/generation` (the
orchestrator and the right-column form) and `features/history` (desktop only).

```
src/app/
  pages/                    routed pages — composition only, they assemble features
    home/                   the base-CV page
  core/
    llm/                    THE ONLY place that talks to a model
      engine.types.ts       EngineKind, EngineDescriptor, EngineTier, ChatMessage
      local/ollama.adapter.ts, llamacpp.adapter.ts
      agent/claude.adapter.ts, opencode.adapter.ts, codex.adapter.ts
      detection/probe.ts    port/base-URL probing with timeout + abort
      llm.service.ts        facade: detect(), listModels(), complete()
    storage/                versioned localStorage repository
    text/                   CV text normalisation
    i18n/                   Spanish message catalogue
  features/
    cv/                     load + manage the base résumé (paste / PDF / DOCX / MD)
    vacancy/                paste and hold the vacancy text
    analysis/               match score + gap report
    adapted/                adapted CV preview + export
    settings/               engine selection, consent, model picker
  shared/ui/                presentational components only
```

Rules: a `pages/*` component is the lazy-loaded route and holds composition only,
never feature logic; `features/*` hold the reusable pieces a page assembles;
`shared/ui` holds no business logic and no engine calls; every adapter implements
one narrow interface so adding a backend never touches a feature.

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

→ **Load the `cv-pipeline` skill** to build or change any of these steps. It holds the
JSON contract for the analysis, the prompting rules for small local models, the
import/export specifics per format, and how the no-invented-facts rule is enforced in
the prompt _and_ in validation.

---

## 5. Model engines

Two tiers, and the difference is a privacy promise, not an implementation detail:

| Tier    | Engines                 | Promise                                                                     |
| ------- | ----------------------- | --------------------------------------------------------------------------- |
| `local` | Ollama, llama.cpp       | The résumé never leaves the device. Default, works offline.                 |
| `agent` | Claude, opencode, Codex | May forward the CV to a cloud provider. Explicit opt-in, revocable, badged. |

- **Ollama** is running on this machine at `http://127.0.0.1:11434` with
  `qwen3.5:latest` (9.7 B, thinking model). **opencode** exposes a service on a
  **dynamic** port — probe, never hardcode. **Claude** requires a subprocess bridge
  (stretch goal) and is a cloud engine. **Codex** is not installed; verify its real
  interface before writing an adapter.
- Detection probes known bases in parallel with a short timeout and an
  `AbortController`. A failed probe is silent and non-fatal: degrade to "no engine
  found" with a setup hint, never a crash or a permanent spinner.
- **CORS is the #1 local-mode bug** and it is invisible in the UI: the app on
  `localhost:4200` needs `OLLAMA_ORIGINS` on Ollama and `--cors` on `opencode serve`.
- **In the desktop app the main process makes every model call** (no CORS, and
  the CLI agents are reachable). It only runs models its own last detection
  found, at the location that detection recorded — the renderer can never name a
  binary or a URL. `claude` is verified (`-p --output-format stream-json`);
  `opencode run` is implemented from its `--help` only; Codex has no adapter.
- Two backends, one facade: `LLM_BACKEND` picks IPC (desktop) or `fetch`
  (browser). Features only ever see `LlmService`.

→ **Load the `llm-integration` skill** before touching `core/llm`. It holds the
verified endpoint table, the adapter contract, streaming/abort rules, JSON discipline
and the CORS fix commands.

---

## 6. Skills

Procedures live in `.agents/skills/<id>/SKILL.md` and are loaded on demand. Load the
relevant one instead of improvising the workflow.

| Skill             | Load it when                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styling`         | Writing or reviewing any CSS, design tokens, dark mode, the CV print stylesheet, or when the build warns about `anyComponentStyle`. Includes `references/tokens.md` — the AA-verified palette. |
| `llm-integration` | Anything in `core/llm`: adding an engine, "no engine found", a hung or malformed model call, CORS.                                                                                             |
| `cv-pipeline`     | The analyse → adapt → export flow, prompts, JSON contracts, CV import/export, or when the model invents something.                                                                             |
| `a11y-audit`      | Accessibility work, a WCAG pass, or before shipping any UI change. Includes `references/checklist.md`.                                                                                         |

---

## 7. Conventions

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

- Global design tokens live in `src/styles.css` as custom properties.
  **Consume tokens, never raw hex or a one-off colour.**
- Per-component stylesheets with Angular's emulated encapsulation; no `::ng-deep`, no
  global selectors leaking from a component.
- The CV preview must print cleanly — a dedicated `@media print` stylesheet, white
  background, no fixed heights, page-break control inside work items.
- Accessible by default: visible focus ring, real `<label for>`, `aria-live` for async
  results, `prefers-reduced-motion` respected.

→ **Load the `styling` skill** before writing or reviewing CSS. It holds the contract,
the recommended token set (`references/tokens.md`, AA-verified), the dark-mode pattern
and the print stylesheet.

### Testing

- **Vitest** + jsdom (the Angular 22 default; Karma is not installed). Tests live
  next to the code they cover, `*.spec.ts`.
- Adapters are the easiest and most valuable thing to test: assert the probe against a
  mocked `fetch`, the JSON validation against malformed model output, and the
  no-invented-facts rule with a fixture.
- If behaviour changes, the tests change in the same change. The tests are the
  executable form of §1.

### i18n

UI strings are Spanish and must not be hardcoded in templates. Centralise them in
the i18n layer and reference them by key, so adding a locale later is a file
addition. `lang="es"` in `index.html`.

`I18n.t()` formats a **number** param with the active locale, so pass the raw
number (`{ chars: cv.charCount }`) and never pre-format it: Spanish writes
`25.000`, and doing it at the call site means every call site has to remember.
Pre-formatted strings (`humanFileSize`, format lists) pass through untouched.

### Git

- **Leave changes uncommitted for review (§1.1).** The user decides when to commit.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.
- One logical change per commit; a partial commit is better named `WIP` than faked.
- Branch `main`; repo-local identity `salcedogeiner <geiner.salcedo.ppc0111@gmail.com>`.

---

## 8. Gotchas specific to this codebase

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
- **Electron**: the renderer is sandboxed, context-isolated, and served from
  `app://curriculae` with a CSP whose inline-script hash is computed from the
  built `index.html` at startup. Every IPC channel checks the sender origin.
  Changing the IPC surface means changing `core/desktop/desktop-api.ts` first;
  `npm run typecheck:desktop` then shows which side is out of date.
- On Ubuntu 23.10+ Electron aborts unless `chrome-sandbox` is root-owned 4755;
  `electron/launch.mjs` detects it, falls back to `--no-sandbox` and prints the
  fix. Do not hardcode `--no-sandbox` anywhere else.
- The workspace (`~/Documentos/Curriculae` by default) is the user's own folder:
  the renderer refers to a generation by its folder id, and `workspace.mjs`
  validates every id and file name. Never accept a path from the renderer.
- qwen3.5 with `think: false` either copies the CV untouched or moves
  achievements between jobs when asked to rewrite. The adaptation call sets
  `reason: true` (≈1 min on a laptop); analysis keeps it off and uses Ollama's
  `format` with the JSON schema instead.
- The adaptation prompt receives verified evidence quotes, never the
  requirement texts: a requirement is phrased by the vacancy, and a small model
  told to "highlight" it copies it in. `fact-check.spec.ts` holds the real
  regression fixture.

---

## 9. Approved dependencies

Runtime dependencies beyond the Angular baseline (`@angular/*`, `rxjs`, `tslib`).
Anything not on this list needs approval first (§1.5).

| Package      | Purpose                                          |
| ------------ | ------------------------------------------------ |
| `pdfjs-dist` | Extract text from an uploaded base CV (PDF).     |
| `mammoth`    | Extract text from an uploaded base CV (DOCX).    |
| `marked`     | Render/parse Markdown input and Markdown export. |
| `jspdf`      | Export the adapted CV to PDF.                    |
| `docx`       | Export the adapted CV to editable DOCX.          |

Development dependencies beyond the Angular CLI defaults: `electron` (the
desktop shell) and `electron-builder` (installers for the release), both
requested by the product owner. Packaging ships only `electron/` and the
Angular build — never `node_modules` (see `build.files` in package.json).

Notes: `pdfjs-dist` needs its worker wired for the bundler — prefer
`pdfjs-dist/build/pdf.worker.min.mjs` via `GlobalWorkerOptions.workerSrc`, and watch
the `initial` budget (500 kB warning / 1 MB error) once these land. `marked` output
is **untrusted**: sanitise before rendering, never pipe it into `innerHTML`.
