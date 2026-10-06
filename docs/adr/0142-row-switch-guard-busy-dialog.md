# 0142. A row switch asks before it drops typed edits; a busy dialog cannot be closed

- Status: Proposed
- Date: 2026-10-06
- Source: issue #132 (R5-01, R5-19, R5-21), Track 10 PR 10.3, owner decision D2 = A
- Related: [0077](0077-ux-a11y-round-b-forms.md) (leave guard UX-030/UX-073, modal dirty
  guard UX-029), [0141](0141-form-errors-stay-in-form.md) (form errors stay in the form)

## Context

A property's record panels (valuations, leases, mortgages, holding costs) use one
`EntityPanel`: a table of rows with Edit and Delete, and one inline form below it. The leave
guard (UX-030) asks before a **navigation** drops a form's unsaved edits. A click on another
row's Edit or Delete is not a navigation, so it replaced the open form without asking, and the
typed edits were lost (R5-01, R5-19). The old row-switch test only switched rows without
typing, so it never saw the loss.

Dialogs that run a write keep their Cancel button disabled while it runs, but the ✕ still
closed them (R5-21). "Clear sample" blocked Esc and the backdrop through the dirty guard,
but not ✕; the property and scenario forms blocked none of them while saving. Closing a
dialog mid-write hides the write's outcome: a failure has nowhere to show.

Owner decision D2: guard the row switch (A), rather than disable the other rows' buttons
while a form is open (B). A keeps every row reachable and asks only when there is something
to lose.

## Decision

1. **A row switch with unsaved edits asks first.** The UI store gets
   `guardedAction(source, fn)`: when the form `source` holds unsaved edits, it holds `fn`
   back and the leave-guard dialog asks, with its existing strings (Keep editing /
   Discard); otherwise `fn` runs at once. `EntityPanel` gives its form a stable key and
   sends the rows' Edit and Delete through `guardedAction` with that key. Edit on the row
   already open does nothing, as before: there is nothing to switch to or drop.
2. **Only the panel's own form counts.** A dirty form in another panel, or on Assumptions,
   does not make a row switch ask, since that form stays open and keeps its edits.
3. **Discard drops only that form's flag.** Before, Discard cleared every form's unsaved
   flag, which was right for a navigation that unmounts them all. For a guarded action the
   other forms stay open; clearing their flags would let their edits leave later without a
   prompt. Discard after a guarded action clears only its source; Discard after a navigation
   clears all, as before.
4. **The form's Cancel button does not ask.** It is an explicit "drop this", as before.
5. **A busy dialog cannot be closed.** `Modal` gets a `busy` prop, separate from `dirty`:
   while it is set, ✕ is disabled, and Esc and backdrop clicks do nothing. Clear sample
   (while clearing), the property form (while saving) and the scenario form (while saving)
   set it. When the write ends, the dialog closes on success or shows the failure and can be
   closed again. A dirty dialog that is not busy still closes from ✕ (UX-029).

## Consequences

- Typed edits in a record panel are no longer lost to a click on another row.
- A dialog's write always reports its outcome in the dialog.
- The Scenarios page's `run()` resets its busy flag in a `finally`, so a write that throws
  cannot leave its buttons disabled (refactor, no visible change today).
- No engine, parity or golden change. No new strings.
