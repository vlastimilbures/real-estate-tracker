# 0221. Settings: tabs and Save in the top bar

- Status: Accepted
- Date: 2026-11-16
- Source: issue #418 (UX/UI review 2026-11, round 2, tracking #425); direction approved
  by the owner on 2026-11-16 (point 9 of the round-2 plan, including the owner's answer
  "always editable, Save/Discard in the top bar"); acceptance delegated by the owner for
  the 2026-11-16 run
- Amends: [0095](0095-assumptions-save-row.md) §1 and §5 (the sticky row at the bottom
  becomes the top bar's actions), [0157](0157-accessibility-batch.md) §6 (the tablist is
  horizontal)
- Related: [0107](0107-property-section-nav.md) (the top bar's section row), UX-030 (the
  unsaved-changes guard, unchanged)

## Context

Settings had a 200 px column of two vertical tabs beside the content, and the Assumptions
form floated a sticky Save row over the bottom of the page. The tabs took a column for two
words, and the floating row covered the last fields at the minimum window. Property detail
already puts its sections in the top bar's last row, and other pages put their page actions
on the top bar's right.

## Decision

1. **Tabs in the top bar.** The two tabs (Assumptions, Backup) move into the top bar's
   section row, styled like Property detail's section links: text only, the selected one
   accented and underlined. They keep the tab pattern of ADR 0157 §6 with a horizontal
   orientation: one Tab stop, Left and Right arrows (wrapping), Home and End move focus;
   Enter or Space switches (manual activation, so the unsaved-changes guard is never
   raised by moving focus). The two-column `.settings-layout` goes; the tab panel uses the
   page's full width.
2. **Save in the top bar.** On the Assumptions tab the state text ("Unsaved changes",
   "All changes saved", "Save failed — your input is kept"), **Discard changes** (ghost)
   and **Save changes** (primary) sit in the top bar's actions. Save submits the form
   through `form=`; Return in a field saves through the form's own key handler (not
   implicit submission, which a button outside the form need not get), only while there
   are unsaved edits, and not on the Return that commits an input-method composition.
   The sticky row at the bottom of the form (`.sticky-actions`) goes. The Backup tab
   shows no actions. A long state text wraps the buttons under it.
   **Never hidden** (replaces ADR 0095 §5): a focused field scrolls clear of the sticky
   top bar (`scroll-margin-top` from `--topbar-h`).
   **Focus order:** Save and Discard now come before the fields in Tab order (they are in
   the top bar); from the last field Return saves, so no Tab back up is needed.
3. **Unchanged:** the fields, the "Scenarios override these" intro line, the button and
   state rules of ADR 0095 §2–§3, the error summary and its focus (§4, it stays after the
   fields), the success toast, and the unsaved-changes guard. Leaving the tab through the
   guard drops the draft, as before, and a save still running then does not write its
   outcome into the form shown on return.
4. The form state moves into a `useAssumptionsForm` hook used by the Settings page, so the
   top bar and the form read the same draft.

## Consequences

- The fields use the full width, nothing floats over them, and Save is always in view at
  the top, with the state text beside it.
- No computed number, stored data or export changes; no dictionary change.
- The ux capture checks the tabs in the top bar's section row and the actions in the top
  bar on the Assumptions tab only, with nothing cut off at 1280 × 800 and at the minimum
  window.
