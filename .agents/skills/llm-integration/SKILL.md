---
name: llm-integration
description: Build or change anything under core/llm — engine detection, the Ollama and llama.cpp adapters, the agent bridges, streaming, timeouts, JSON validation and CORS. Load this when adding an engine, debugging "no engine found", when a model call hangs or returns malformed JSON, or when wiring a prompt to a local server.
---

# LLM integration

Everything that talks to a model lives under `src/app/core/llm/`. **No feature may
call a provider directly** — they go through the `LlmService` facade, which is the
single place where the `local` / `agent` privacy tier is enforced (AGENTS.md §1.1).
If a feature needs something the facade does not expose, extend the facade.

## The two tiers

| Tier    | Engines                 | Résumé leaves the device?                                                 | Consent                               |
| ------- | ----------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| `local` | Ollama, llama.cpp       | **No**                                                                    | none, it's default                    |
| `agent` | Claude, opencode, Codex | **Maybe — it depends on the provider opencode/claude is configured with** | explicit, revocable, badged in the UI |

An `agent` engine is never the default selection, and selecting one is an explicit
user action that the UI must acknowledge as possibly sending personal data to a
third party. Persist the consent flag separately from the engine choice so revoking
it is a one-click operation.

## Verified local interfaces

Re-verify with the commands below before trusting this table; the dev machine's
state will drift.

| Engine    | Base URL                                | Health probe                  | Models                         | Chat                                                                       |
| --------- | --------------------------------------- | ----------------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| Ollama    | `http://127.0.0.1:11434`                | `GET /` → `Ollama is running` | `GET /api/tags`                | `POST /api/chat` (native), fallback `POST /v1/chat/completions`            |
| llama.cpp | `http://127.0.0.1:8080`                 | `GET /health`                 | `GET /v1/models`               | `POST /v1/chat/completions`                                                |
| LM Studio | `http://127.0.0.1:1234`                 | `GET /v1/models`              | `GET /v1/models`               | `POST /v1/chat/completions`                                                |
| opencode  | **dynamic** — `opencode service status` | `GET /api/info`               | via OpenAPI at `/openapi.json` | session + message API under `/api/*`                                       |
| Claude    | n/a from a browser                      | `claude auth status`          | —                              | `claude -p --output-format json` — needs a subprocess bridge, stretch goal |
| Codex     | unverified                              | —                             | —                              | —                                                                          |

```bash
curl -s http://127.0.0.1:11434/api/tags   # native list
curl -s http://127.0.0.1:11434/v1/models  # OpenAI-compatible list
opencode service status                  # prints the dynamic base URL
```

**Never hardcode a port.** The opencode service picks a free port at runtime
(`:49374` observed). Probe, and let the user's saved URL win over a probe hit.

## Detection

1. Probe the candidate bases **in parallel** with a ~1 s `AbortController` timeout.
2. Candidates: saved custom URLs first, then the known ports above, then the
   opencode service URL if `opencode service status` resolves.
3. A failed probe is a **normal, silent outcome**. Never let it reject the batch,
   never surface it as an error toast, never leave a spinner running.
4. Degrade to "no engine found" with a setup hint. A probe that throws is a bug.
5. Re-probe when the user returns to settings or after a failed call — servers get
   started and stopped behind the app's back.

## CORS — the failure you will hit first

The app is served from `http://localhost:4200` and calls other origins. A model
server that does not allow that origin fails in the console with **no useful error in
the UI**. The fix lives on the server side:

```bash
OLLAMA_ORIGINS='*' ollama serve                     # Ollama
opencode serve --port 4096 --cors http://localhost:4200
./llama-server --port 8080 --host 127.0.0.1         # llama.cpp
```

A `TypeError: Failed to fetch` from `fetch()` almost always means CORS, not "the
server is down". Distinguish the two: a connection refused is a dead server, a CORS
rejection is a live server that is unhappy. The first-run hint in settings must say
which one happened and print the exact command to fix it.

## Calling a model

- **Stream.** `fetch` with a `ReadableStream` body, parsing SSE `data:` lines. A local
  model rewriting a CV takes 10–60 s; a non-streamed call is a frozen screen, which is
  a bug (§7).
- **Thinking models.** `qwen3.5` emits reasoning tokens before the answer. Keep JSON
  instructions in the system prompt, tolerate leading prose, and never assume a
  non-streamed reply is complete. Prefer a model whose context window comfortably
  exceeds CV + vacancy + prompt.
- **Always cancellable.** Thread an `AbortController` from the UI down to the
  adapter. The cancel button must actually stop generation, not just hide output.
- **Timeouts**: short for probes (~1 s), long for generation (2–5 min), and always
  explicit. Distinguish a user cancel from a timeout from a network error — the
  Spanish UI message differs for each.
- **Retries**: at most one automatic retry, and only on transport failure, never on a
  `400`. A malformed-JSON answer should surface as "the model returned something
  unexpected" with a retry action, not a silent loop.

## JSON discipline

The model is an untrusted source of structured data, not a source of truth.

- Ask for JSON in the system prompt, and state the exact keys.
- Parse defensively: strip markdown fences (`json … `), trim prose before the
  first `{` and after the last `}`, then `JSON.parse` in a `try`.
- **Validate the parsed shape** against a real schema or explicit guards before use.
  A missing or wrong-typed field is a normal outcome, not an exception.
- Clamp: a match score outside 0–100 is clamped, not trusted.
- Never render model output as HTML. It is text; `textContent` and Angular
  interpolation are the only acceptable sinks.

## Testing adapters

The highest-value tests in the repo, and they need no GPU — stub `globalThis.fetch`
and assert:

- the probe resolves a healthy engine, and a rejected fetch yields `null` (not a throw);
- the adapter posts the expected URL, method and body shape;
- malformed JSON (fences, prose, truncated, wrong types) degrades to a typed error;
- an `AbortSignal` aborts the request.

## Checklist

- [ ] Calls go through `LlmService`; no direct provider SDK in a feature.
- [ ] Engine tagged `local` or `agent`; `agent` requires consent + badge.
- [ ] No hardcoded port; probe with timeout + abort.
- [ ] Probe failure is silent and non-fatal.
- [ ] Streaming + working cancel.
- [ ] JSON validated, clamped, never `innerHTML`.
- [ ] CORS hint in the UI on first failure, with the exact fix command.
- [ ] Adapter tests stub `fetch` and cover abort + malformed JSON.
