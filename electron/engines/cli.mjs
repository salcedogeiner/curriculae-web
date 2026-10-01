// @ts-check
import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { EngineError } from './shared.mjs';

/**
 * CLI agents, run as subprocesses of the main process. Both are `agent` tier:
 * they forward the prompt — the CV included — to whatever provider the user
 * configured, so the renderer only reaches them through the consent gate in
 * `LlmService` (AGENTS.md §1.2).
 *
 * Interfaces verified on 2026-10-01:
 * - claude 2.x: `claude -p --output-format stream-json --verbose
 *   --include-partial-messages` streams `stream_event` lines whose
 *   `event.delta.type === 'text_delta'` carry the answer, and ends with a
 *   `{"type":"result"}` line. The prompt is read from stdin.
 * - opencode 2.0: `opencode models` prints one `provider/model` per line;
 *   `opencode run -m provider/model <message>` prints the answer. Only the help
 *   text could be verified — this machine had no provider configured — so the
 *   output is taken as plain text.
 * - Codex is not installed here, and AGENTS.md §5 forbids guessing its
 *   interface: no adapter until it can be verified.
 */

/** @typedef {import('./shared.mjs').EngineDescriptor} EngineDescriptor */
/** @typedef {import('./shared.mjs').ModelDescriptor} ModelDescriptor */
/** @typedef {import('./shared.mjs').CompletionRequest} CompletionRequest */
/** @typedef {import('./shared.mjs').RunOptions} RunOptions */

/**
 * An app started from a desktop launcher gets a minimal PATH, without the
 * per-user install dirs these CLIs live in. Look there too.
 *
 * @param {NodeJS.ProcessEnv} env
 */
export function searchPath(env = process.env) {
  const home = homedir();
  const extra = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.opencode', 'bin'),
    path.join(home, '.claude', 'local'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.bun', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ];
  const fromEnv = (env['PATH'] ?? '').split(path.delimiter).filter(Boolean);
  return [...new Set([...fromEnv, ...extra])];
}

/**
 * Resolves a binary without a shell, so nothing from the environment is ever
 * interpreted as a command line.
 *
 * @param {string} name
 * @param {readonly string[]} dirs
 * @returns {string | null}
 */
export function findExecutable(name, dirs = searchPath()) {
  const names = process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`] : [name];
  for (const dir of dirs) {
    for (const candidate of names) {
      const full = path.join(dir, candidate);
      try {
        accessSync(full, constants.X_OK);
        return full;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

/**
 * Runs a short command and resolves its stdout, or `null` on failure/timeout.
 *
 * @param {string} bin
 * @param {readonly string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<string | null>}
 */
function capture(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: tmpdir(),
      env: { ...process.env, PATH: searchPath().join(path.delimiter), NO_COLOR: '1' },
      timeout: timeoutMs,
    });
    child.stdout.setEncoding('utf8').on('data', (data) => (out += data));
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? out : null));
  });
}

/* ── Claude ───────────────────────────────────────────────────── */

const CLAUDE_MODELS = [
  { name: 'sonnet', label: 'Claude Sonnet' },
  { name: 'opus', label: 'Claude Opus' },
  { name: 'haiku', label: 'Claude Haiku' },
];

/** @returns {Promise<EngineDescriptor>} */
export async function detectClaude() {
  const bin = findExecutable('claude');
  const version = bin ? await capture(bin, ['--version'], 5000) : null;
  return {
    id: 'claude',
    label: 'Claude',
    tier: 'agent',
    location: bin,
    status: version === null ? 'unavailable' : 'ready',
    models:
      version === null
        ? []
        : CLAUDE_MODELS.map((model) => ({
            id: `claude:${model.name}`,
            engineId: /** @type {const} */ ('claude'),
            tier: /** @type {const} */ ('agent'),
            name: model.name,
            label: model.label,
            details: null,
            thinking: false,
          })),
  };
}

/**
 * Folds one line of `stream-json` output into the run state.
 *
 * @param {string} line
 * @returns {{ text?: string, result?: string, error?: string } | null}
 */
export function parseClaudeLine(line) {
  if (!line.trim()) {
    return null;
  }
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (event.type === 'stream_event' && event.event?.delta?.type === 'text_delta') {
    return { text: String(event.event.delta.text ?? '') };
  }
  if (event.type === 'result') {
    return event.is_error
      ? { error: String(event.result ?? event.subtype ?? 'error') }
      : { result: String(event.result ?? '') };
  }
  return null;
}

/**
 * @param {string} bin
 * @param {CompletionRequest} request
 * @param {RunOptions} options
 */
export function completeWithClaude(bin, request, options) {
  const system = request.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const prompt = request.messages
    .filter((m) => m.role !== 'system')
    .map((m) => m.content)
    .join('\n\n');
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model',
    request.model.name,
    // No tools, no session file, no settings or CLAUDE.md from wherever the
    // app was started: a plain completion and nothing else.
    '--tools',
    '',
    '--no-session-persistence',
    '--setting-sources',
    '',
    ...(system ? ['--system-prompt', system] : []),
  ];

  let streamed = '';
  /** @type {string | null} */
  let final = null;
  /** @type {string | null} */
  let failure = null;

  return runStreaming(bin, args, prompt, options, (line) => {
    const parsed = parseClaudeLine(line);
    if (parsed?.text) {
      streamed += parsed.text;
      options.onChunk({ kind: 'content', text: parsed.text });
    } else if (parsed?.result !== undefined) {
      final = parsed.result;
    } else if (parsed?.error) {
      failure = parsed.error;
    }
  }).then(() => {
    if (failure !== null) {
      throw new EngineError('engine-failed', failure);
    }
    return final ?? streamed;
  });
}

/* ── opencode ─────────────────────────────────────────────────── */

const OPENCODE_MODEL = /^[\w.-]+\/[\w.:@#/-]+$/;

/**
 * @param {string} output
 * @returns {string[]}
 */
export function parseOpencodeModels(output) {
  return [
    ...new Set(
      output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => OPENCODE_MODEL.test(line)),
    ),
  ];
}

/** @returns {Promise<EngineDescriptor>} */
export async function detectOpencode() {
  const bin = findExecutable('opencode');
  const output = bin ? await capture(bin, ['models'], 15000) : null;
  const names = output === null ? [] : parseOpencodeModels(output);
  return {
    id: 'opencode',
    label: 'opencode',
    tier: 'agent',
    location: bin,
    status: output === null ? 'unavailable' : names.length > 0 ? 'ready' : 'no-models',
    models: names.map((name) => ({
      id: `opencode:${name}`,
      engineId: /** @type {const} */ ('opencode'),
      tier: /** @type {const} */ ('agent'),
      name,
      label: name,
      details: null,
      thinking: false,
    })),
  };
}

/** Linux caps a single argv entry at 128 KiB; stay well below it. */
const MAX_ARG_CHARS = 120_000;

/**
 * @param {string} bin
 * @param {CompletionRequest} request
 * @param {RunOptions} options
 */
export async function completeWithOpencode(bin, request, options) {
  const message = request.messages.map((m) => m.content).join('\n\n');
  if (message.length > MAX_ARG_CHARS) {
    throw new EngineError('engine-failed', 'El texto es demasiado largo para opencode');
  }
  let content = '';
  await runStreaming(bin, ['run', '-m', request.model.name, message], null, options, (line) => {
    const text = `${line.replace(/\u001b\[[0-9;]*m/g, '')}\n`;
    content += text;
    options.onChunk({ kind: 'content', text });
  });
  return content;
}

/* ── Subprocess runner ────────────────────────────────────────── */

/**
 * Spawns a CLI, feeds stdin, hands stdout over line by line, and kills the
 * process when the signal aborts — a cancel really stops generation.
 *
 * @param {string} bin
 * @param {readonly string[]} args
 * @param {string | null} stdin
 * @param {RunOptions} options
 * @param {(line: string) => void} onLine
 * @returns {Promise<void>}
 */
function runStreaming(bin, args, stdin, options, onLine) {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(new EngineError('aborted', 'Generación cancelada'));
      return;
    }
    const child = spawn(bin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: tmpdir(),
      env: { ...process.env, PATH: searchPath().join(path.delimiter), NO_COLOR: '1' },
    });

    let buffer = '';
    let stderr = '';
    const kill = () => child.kill('SIGTERM');
    options.signal.addEventListener('abort', kill, { once: true });

    child.stdout.setEncoding('utf8').on('data', (data) => {
      buffer += data;
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        onLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    });
    child.stderr.setEncoding('utf8').on('data', (data) => {
      stderr = (stderr + data).slice(-2000);
    });
    child.on('error', (error) => {
      options.signal.removeEventListener('abort', kill);
      reject(new EngineError('unreachable', error.message));
    });
    child.on('close', (code) => {
      options.signal.removeEventListener('abort', kill);
      if (buffer) {
        onLine(buffer);
      }
      if (options.signal.aborted) {
        reject(new Error('aborted'));
      } else if (code !== 0) {
        reject(
          new EngineError('engine-failed', stderr.trim().split('\n').pop() || `código ${code}`),
        );
      } else {
        resolve();
      }
    });

    child.stdin.on('error', () => {
      /* the process exited early; `close` reports why */
    });
    child.stdin.end(stdin ?? '');
  });
}
