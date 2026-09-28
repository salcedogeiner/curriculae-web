---
name: a11y-audit
description: Run the accessibility audit against the running app and fix every violation before finishing. Load this when asked to improve accessibility, work through a WCAG checklist, or before shipping any UI change to this app.
---

# Accessibility audit

Accessibility is a **contract**, not a vibe. This skill is the manual layer on top of
what the DOM and the unit tests can catch: it covers real tab order, real contrast
in both themes, real focus movement after an async action, and the print path.

## Before you start

- Run `npm start` and audit the real page at `http://localhost:4200`.
- Read `references/checklist.md` — the WCAG A/AA checklist scoped to this app, with the
  element that breaks each item.
- Audit **every** route, not just the CV preview. The app is a multi-step flow and the
  steps have very different interaction shapes.
- Check both light and dark. Tokens guarantee parity only if nothing hardcodes a colour.

## What matters most in this app

1. **The async path.** Analysis and adaptation take 10–60 s on a local model. Progress
   must be announced (`aria-live="polite"`), the cancel button must be reachable and
   must actually cancel, and focus must not be lost when the result replaces a spinner.
   A screen-reader user must be able to tell that something is happening and that it
   finished.
2. **The privacy consent.** The opt-in for an `agent` engine is a consent control, not
   a checkbox. It needs a programmatic label, a description of what leaves the device
   (`aria-describedby`), and it must be reachable **before** the action it gates.
3. **The match score.** Never colour alone. The score carries a number _and_ a word
   ("alta", "media", "baja") so it survives greyscale and colour blindness.
4. **The CV preview.** It is the exported document; headings must be real headings so
   the structure survives to the PDF and to a screen reader.
5. **Paste targets.** The vacancy textarea and the CV paste box are the primary input.
   They need real `<label for>`, a described format hint, and a character/section
   counter that is not announced on every keystroke.

## Workflow

1. **Automated first.** Run an axe scan on every route. Fix everything at
   **serious/critical** before continuing by hand.
2. **Keyboard pass** — tab from the top of each route.
   - Every control reachable, focus always visible (the `--focus-ring` token must
     survive every restyle).
   - No focus trap, except a modal that traps deliberately and returns focus to its
     trigger on close.
   - After a successful import or export, focus moves to the confirmation.
   - After a failed call, focus moves to the error, and the error is announced.
3. **A11y tree** — headings form a sensible outline (`h1` = the current step, `h2` =
   section), lists are `<ul>/<li>`, the gap list is a real list, icons are
   `aria-hidden` when adjacent text labels them, links have text.
4. **Contrast** — every text pair in both themes. The palette in
   `styling/references/tokens.md` is AA-verified; a violation means a raw value crept
   in, not that the token needs weakening.
5. **Reduced motion** — `prefers-reduced-motion` is handled globally; confirm nothing
   new bypasses it. The match-score and progress animations are the usual offenders.
6. **Print** — `Ctrl+P` on the CV preview: app chrome hidden, no orphaned headings,
   text still legible in black on white.
7. **Fix & verify** — after each fix, re-run the automated scan and the keyboard pass
   on the route you broke, not just on the whole app.

## If a test contradicts a manual finding

The tests are the executable spec. When the browser shows real behaviour a test
denied, update the test to assert the **correct** behaviour alongside the fix. Never
delete an assertion to make a run green.

## Checklist

- [ ] axe clean at serious/critical on every route.
- [ ] Full keyboard pass per route; no traps; focus ring intact.
- [ ] Async: progress announced, cancel reachable and effective, focus lands on the result.
- [ ] Agent-engine consent labelled, described, and reachable before the action.
- [ ] Match score has a text equivalent, not colour alone.
- [ ] A11y tree reviewed: headings, lists, labels, icons.
- [ ] AA contrast in light **and** dark.
- [ ] `prefers-reduced-motion` respected.
- [ ] Print path legible.
- [ ] `npm run build && npm test` green after fixes.
