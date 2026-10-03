# 0077. UX and accessibility round B: forms and dialogs

- Status: Accepted
- Date: 2026-10-02
- Source IDs: DR-178, DR-150, DR-151, DR-154 (P16a plan)
- Builds on: UX-030, UX-040, UX-066 (legacy IDs, ADR 0081)

## Context

- **DR-178.** The About dialog body scrolls but holds no focusable content, so a keyboard
  user cannot scroll it (axe `scrollable-region-focusable`, serious, on the `65-about`
  capture).
- **DR-150.** The property dialog writes "\*" into three label strings (name, purchase date,
  purchase price) and its controls carry no `aria-required`, unlike the record forms and
  Settings → Assumptions after UX-040.
- **DR-151.** The unsaved-changes guard (UX-030) covers Settings → Assumptions only. An open
  inline record form (valuation, lease, mortgage, holding costs) loses its draft when the
  user navigates away.
- **DR-154.** The menu shortcuts are ignored while a dialog is open (UX-066), but ⌘,
  (Settings) still navigates away from an open dialog, whose input is then lost.

## Decision

Owner, 2026-10-02 (P16 round B scope, split a/b):

1. **The About body is a keyboard-focusable region** named by the dialog title; Tab reaches
   it after the close button and the arrow keys scroll it (UX-071).
2. **The property dialog marks required fields through the form field itself**: the visual
   marker comes from CSS and the controls carry `aria-required`; the label strings no longer
   contain "\*" (en/cs/ru) (UX-072).
3. **Inline record forms join the unsaved-changes guard.** While a record form's draft differs
   from the values it opened with, leaving the screen asks "Keep editing / Discard" as
   Settings → Assumptions does. Several forms can be open at once, so the guard tracks each
   form separately (UX-073).
4. **⌘, is ignored while a dialog is open**, like ⌘N and ⌘1–⌘5 (UX-074).

## Consequences

No computed number changes: parity, the golden master and the bench budgets are unchanged.
The visible changes are UX-071…UX-074. The rest of round B (chart tables, native menu
language, axe in CI) is planned separately as P16b.
