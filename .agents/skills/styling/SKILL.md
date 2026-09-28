---
name: styling
description: Apply or review CSS in this app — design tokens, component styles, the CV print stylesheet, dark mode, and the 4 kB style budget. Load this when writing any component stylesheet, touching src/styles.css, styling the CV preview, fixing a visual bug, or when the build warns about anyComponentStyle.
---

# Styling

Plain CSS with Angular's emulated encapsulation. No Tailwind, no CSS-in-JS, no
component library. The app runs on the user's machine, so **there are no web fonts
and no CDN** — a missing network must not cost layout or a fallback flash. Everything
below assumes the system font stack.

## The contract

1. **Tokens, never raw values.** Every colour, space, radius and font size comes from
   a custom property in `src/styles.css`. A raw `#1f5eff` or `14px` inside a
   component is a defect, not a shortcut. If the token you need does not exist, add
   it to `styles.css` first.
2. **One stylesheet per component**, Angular's default `<name>.css`, relying on emulated
   encapsulation. No `::ng-deep`, no global element selectors leaking out of a
   component. Use `:host` for the component's own box.
3. **Stay inside the 4 kB warning / 8 kB error budget** per component stylesheet
   (`anyComponentStyle` in `angular.json`). A stylesheet that blows the budget fails
   the production build. If a component genuinely needs more, split it into child
   components — do not raise the budget to make the error go away.
4. **Print is a first-class target.** The adapted CV is exported, so the preview must
   look right on paper (see below). Chrome added to the app must be hidden in print.
5. **Accessible by default**: visible focus ring, AA contrast, real labels,
   `prefers-reduced-motion` respected. A change that only looks right is unfinished.

## Before you write CSS

Read `references/tokens.md` — it holds the recommended token set (palette verified
for AA contrast, spacing scale, type scale, radii, shadows) and the ready-to-paste
`:root` / dark-mode blocks. Do not invent a second palette.

## Layout rules

- **Responsive without media-query sprawl**: `flex` + `grid` + `gap`, `min-width: 0`
  on flex children (otherwise a long CV line blows out the layout), `clamp()` for
  fluid type. Prefer container-relative units. Reach for a media query only when the
  layout genuinely changes shape.
- **Never a fixed `height`** on anything holding user text — a long vacancy
  description or CV will overflow. Use `min-height`.
- `overflow-wrap: anywhere` on model output and pasted text; long URLs and skill
  strings must not break the layout.
- Z-index: no ad-hoc `z-index: 9999`. If layers are needed, define a scale
  (`--z-dropdown`, `--z-modal`, `--z-toast`).

## Dark mode

Define tokens once in `:root` and override them in a single block:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    /* token overrides */
  }
}
:root[data-theme='dark'] {
  /* same overrides */
}
```

A manual toggle sets `data-theme` on `<html>`; the media query covers users who never
open settings. Components never branch on theme — they only read tokens, so both
themes work the moment a token is right. Persist the choice in `localStorage` and set
it before first paint in `index.html` to avoid a flash.

## The CV preview and print stylesheet

The adapted CV is the product's output. It must survive `Ctrl+P` and the PDF
exporter.

- Keep a dedicated print block in the CV feature's stylesheet (or
  `src/styles.css` if shared), roughly:

```css
@page {
  size: A4;
  margin: 14mm 16mm;
}

@media print {
  .no-print,
  .app-nav,
  button {
    display: none !important;
  }

  body {
    background: #fff;
    color: #000;
    font-size: 10.5pt;
    line-height: 1.4;
  }

  .cv-section,
  .cv-item {
    break-inside: avoid;
  }

  a[href^='http']::after {
    content: ' (' attr(href) ')';
    font-size: 0.85em;
  }
}
```

- No shadows, no rounded corners, no background fills in print — they cost ink and
  render inconsistently across browsers.
- Print colours with `print-color-adjust: exact` **only** where a background is
  load-bearing (a section header bar); otherwise let it fall back to white.
- The PDF exporter and `@media print` must agree: if `jspdf` draws the CV itself,
  mirror the same spacing scale so the download matches the preview.

## Checklist

- [ ] No raw hex/px outside `src/styles.css`.
- [ ] No `::ng-deep`, no global selectors from a component.
- [ ] Component stylesheet under 4 kB.
- [ ] `min-width: 0` on flex children; no fixed heights on text containers.
- [ ] `overflow-wrap` on model/pasted text.
- [ ] Focus ring visible on every interactive element.
- [ ] Light **and** dark both checked for the touched surface.
- [ ] `@media print` still sane: app chrome hidden, no orphans, links readable.
- [ ] `prefers-reduced-motion` respected by anything new.
- [ ] `npm run build` shows no budget warning.
