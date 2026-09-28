# Recommended design tokens

The canonical palette, scales and the ready-to-paste `:root` block for
`src/styles.css`. Use these instead of inventing values per component.

**No web fonts.** The app is local-first and must render identically offline, so the
stack is system fonts only. A web font would also add a network dependency to an app
whose selling point is that nothing leaves the machine.

## `src/styles.css`

```css
:root {
  color-scheme: light dark;

  /* ── Superficies ─────────────────────────────────────────── */
  --color-bg: #f6f7f9;
  --color-surface: #ffffff;
  --color-surface-2: #f0f2f5;
  --color-border: #d9dee5;
  --color-border-strong: #b6bfcc;

  /* ── Texto ───────────────────────────────────────────────── */
  --color-text: #14181f;
  --color-text-muted: #566070;
  --color-text-inverse: #ffffff;

  /* ── Acento ──────────────────────────────────────────────── */
  --color-accent: #1f5eff;
  --color-accent-hover: #1a4fdb;
  --color-accent-soft: #e8efff;

  /* ── Semánticos ──────────────────────────────────────────── */
  --color-success: #0f7a4d;
  --color-warning: #8a5a00;
  --color-danger: #b3261e;
  --color-info: #0b6a8f;

  /* ── Radios y sombras ────────────────────────────────────── */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 14px;
  --shadow-1: 0 1px 2px rgb(20 24 31 / 0.06), 0 1px 3px rgb(20 24 31 / 0.1);
  --shadow-2: 0 8px 24px rgb(20 24 31 / 0.12);

  /* ── Espaciado (escala de 4 px) ──────────────────────────── */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;

  /* ── Tipografía ──────────────────────────────────────────── */
  --font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-serif: Georgia, 'Times New Roman', serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;
  --text-fluid: clamp(1.25rem, 1rem + 1.2vw, 1.75rem);

  --leading-tight: 1.2;
  --leading-normal: 1.55;

  /* ── Foco y capas ────────────────────────────────────────── */
  --focus-ring: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent);
  --z-dropdown: 100;
  --z-modal: 200;
  --z-toast: 300;

  /* ── Métricas ────────────────────────────────────────────── */
  --content-width: 68rem;
  --sidebar-width: 16rem;
}

/* Dark: system preference, unless the user pinned a theme. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;

    --color-bg: #14181f;
    --color-surface: #1c222b;
    --color-surface-2: #232a35;
    --color-border: #333c4a;
    --color-border-strong: #4a5567;

    --color-text: #e8ecf1;
    --color-text-muted: #a3adba;
    --color-text-inverse: #14181f;

    --color-accent: #7aa2ff;
    --color-accent-hover: #9bb8ff;
    --color-accent-soft: #1d2941;

    --color-success: #4ec98a;
    --color-warning: #e0a33a;
    --color-danger: #f08b84;
    --color-info: #5fc0e0;

    --shadow-1: 0 1px 2px rgb(0 0 0 / 0.4);
    --shadow-2: 0 8px 24px rgb(0 0 0 / 0.5);
  }
}

/* Dark pinned manually. */
:root[data-theme='dark'] {
  color-scheme: dark;

  --color-bg: #14181f;
  --color-surface: #1c222b;
  --color-surface-2: #232a35;
  --color-border: #333c4a;
  --color-border-strong: #4a5567;

  --color-text: #e8ecf1;
  --color-text-muted: #a3adba;
  --color-text-inverse: #14181f;

  --color-accent: #7aa2ff;
  --color-accent-hover: #9bb8ff;
  --color-accent-soft: #1d2941;

  --color-success: #4ec98a;
  --color-warning: #e0a33a;
  --color-danger: #f08b84;
  --color-info: #5fc0e0;

  --shadow-1: 0 1px 2px rgb(0 0 0 / 0.4);
  --shadow-2: 0 8px 24px rgb(0 0 0 / 0.5);
}
```

## Contrast

Checked against their own surface with the WCAG relative-luminance formula; all body
pairs are **≥ 4.5:1 (AA)**:

| Foreground                     | Surface           | Ratio  |
| ------------------------------ | ----------------- | ------ |
| `--color-text` `#14181f`       | `--color-surface` | ~17:1  |
| `--color-text-muted` `#566070` | `--color-surface` | ~6.4:1 |
| `--color-accent` `#1f5eff`     | `--color-surface` | ~5.1:1 |
| `--color-success` `#0f7a4d`    | `--color-surface` | ~5.4:1 |
| `--color-warning` `#8a5a00`    | `--color-surface` | ~5.9:1 |
| `--color-danger` `#b3261e`     | `--color-surface` | ~6.5:1 |
| `--color-info` `#0b6a8f`       | `--color-surface` | ~6.1:1 |
| `--color-accent` `#7aa2ff`     | dark `#1c222b`    | ~6.4:1 |
| `--color-text-muted` `#a3adba` | dark `#1c222b`    | ~7.0:1 |

`--color-warning` and `--color-success` are **text colours**, not backgrounds. To use
them as a fill, pair with `--color-text-inverse` and re-check.

## Where each token earns its keep in this app

| Area        | Tokens                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Vacancy box | `--color-surface`, `--color-border`, `--color-radius-md`, `--text-sm` / `--text-base`                |
| Match score | `--color-success` ≥ 70, `--color-warning` 40–69, `--color-danger` < 40; `--font-mono` for the number |
| Gap list    | `--color-surface-2` rows, `--color-danger` only for the "falta" marker, never a red block            |
| CV preview  | `--color-text`, `--font-sans`, spacing scale, print overrides (§print in `SKILL.md`)                 |
| Engine chip | `--color-accent-soft` for a `local` engine, `--color-warning` border for an `agent` engine           |

The engine chip distinction is a **privacy** affordance, not decoration: an `agent`
engine must be visually obvious as "this may send your CV to a cloud provider".
