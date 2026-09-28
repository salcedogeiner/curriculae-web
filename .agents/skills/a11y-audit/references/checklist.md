# Accessibility checklist — Curriculae

WCAG 2.2 A/AA, scoped to this app. Each item names the element that breaks it in
practice. Work top to bottom.

## 1. Keyboard (WCAG 2.1.1, 2.4.3, 2.4.7)

- [ ] Every interactive element reachable by <kbd>Tab</kbd>, in DOM order.
- [ ] Visible focus on all of them — the `--focus-ring` token in `styles.css`.
      _Breaks when:_ a component sets `outline: none` instead of replacing it.
- [ ] No keyboard trap. Only a modal traps, and it returns focus to its trigger.
- [ ] <kbd>Esc</kbd> closes any dialog; focus returns to the trigger.
- [ ] Drag-and-drop import has a keyboard equivalent (a real `<input type="file">`).
      _Breaks when:_ the drop zone is a `<div>` with a click handler.
- [ ] Skip link to the main content as the first focusable element.

## 2. Name, role, value (WCAG 4.1.2)

- [ ] Every control has an accessible name — `aria-label` or a real `<label for>`.
- [ ] Placeholder text is never the only label.
- [ ] Icon-only buttons carry an `aria-label`; decorative icons are `aria-hidden`.
- [ ] `<button type="button">` for everything that is not a submit. A bare
      `<button>` inside a form submits it by accident.
- [ ] Toggle/checkbox state exposed via native `<input type="checkbox">` where
      possible, so the engine-consent control is real.
- [ ] `aria-expanded` / `aria-controls` on disclosure and accordion patterns.

## 3. Structure (WCAG 1.3.1, 2.4.6)

- [ ] One `<h1>` per route = the current step.
- [ ] Heading levels descend without skipping.
- [ ] The gap list and the requirement list are real `<ul>/<li>`.
- [ ] `<nav>`, `<main>`, `<aside>` landmarks present; `<main>` is the skip target.
- [ ] The CV preview uses real headings so its structure reaches the PDF.

## 4. Async and status (WCAG 4.1.3)

- [ ] Progress during analysis/adaptation is in an `aria-live="polite"` region.
- [ ] Completion is announced, not just drawn.
- [ ] Errors are announced (`role="alert"`) and focus moves to them.
- [ ] Nothing updates on a timer without being announced.
      _Breaks when:_ the match score animates from 0 to 100 silently.
- [ ] The cancel button is reachable and cancels the real request.

## 5. Colour and contrast (WCAG 1.4.3, 1.4.1, 1.4.11)

- [ ] All text ≥ 4.5:1 (≥ 3:1 for ≥ 24 px), in **both** themes.
- [ ] Meaning never carried by colour alone.
      _Breaks when:_ the match score is only a green/amber/red pill. It also needs the
      number and a word.
- [ ] Focus and component boundaries ≥ 3:1 non-text contrast (WCAG 1.4.11).
- [ ] No raw hex outside `src/styles.css` — a violation is a signal that a token is
      missing, not that the token is too light.

## 6. Forms and error handling (WCAG 3.3.1, 3.3.2, 3.3.3)

- [ ] Errors identified in text, not only colour.
- [ ] `aria-invalid` + `aria-describedby` wiring the error to its field.
- [ ] Labels persist; they do not disappear on focus.
- [ ] The CV paste box and the vacancy textarea have a described format hint.
- [ ] Character/section counters are **not** announced on every keystroke
      (`aria-live="off"` unless the limit is near).
- [ ] Input is never blocked by paste: a large paste must be accepted, not truncated
      silently.

## 7. Privacy consent as an accessibility concern

- [ ] The `agent` engine opt-in is a labelled control with a description of what
      leaves the device, wired via `aria-describedby`.
- [ ] It is reachable **before** the action it gates — the user is never asked to
      consent after their CV was already sent.
- [ ] Revoking consent is reachable from the same place and needs no confirmation
      dialog.
- [ ] The engine badge is not colour-only: text says "local" or "agent".

## 8. Motion, zoom, reflow (WCAG 2.3.3, 1.4.4, 1.4.10)

- [ ] `prefers-reduced-motion: reduce` disables non-essential animation.
- [ ] Usable at 200% browser zoom and at 320 CSS px width with no horizontal
      scrolling of the CV preview.
- [ ] No `user-scalable=no` / `maximum-scale=1` in `index.html`.

## 9. Print output

- [ ] `Ctrl+P` on the CV preview: app chrome hidden, white background, no orphaned
      section headings, links still legible.

## 10. Verification

- [ ] axe scan clean at serious/critical on every route.
- [ ] Real keyboard pass per route.
- [ ] `npm run build && npm test` green.
