# 0143. Confirm rows name the record, take focus and stay open on failure

- Status: Accepted
- Date: 2026-10-06
- Source: issue #132 (R5-08), Track 10 PR 10.4
- Related: [0142](0142-row-switch-guard-busy-dialog.md) (row-switch guard),
  [0077](0077-ux-a11y-round-b-forms.md) (forms a11y round)

## Context

Destructive actions ask inline before they run: deleting a property, a property's record
(valuation, lease, mortgage block), a scenario, and deactivating a property. These four
confirms were built four ways, and three defects followed (R5-08):

- A record row asked only "Delete this record?", so the user could not tell which of several
  valuations or leases was about to go.
- Focus stayed on the button that opened the row. A keyboard or screen-reader user had to hunt
  for "Yes, delete", and after Cancel focus was not put back anywhere useful.
- The scenario confirm closed **before** the delete ran. A failed delete had nowhere to show
  next to the action, unlike every other confirm (UX-050).

## Decision

1. **One `ConfirmRow`.** Every inline destructive confirm uses one component with a message,
   a confirm label, a busy label, `onConfirm(): Promise<MutationResult>` and `onCancel`. It
   uses the `.confirm-row` styles, keeps its own busy and error state, and the caller closes
   it when the write succeeds.
2. **The message names the record.** A property record panel names the row by its kind and
   start date: "Delete the valuation from 01.01.2026?", "Delete the lease from …?", "Delete
   the mortgage block from …?" (en, cs, ru). Property, scenario and deactivate confirms
   already named their target and keep their texts.
3. **Focus moves into the row.** When the row opens, focus goes to its Cancel button, the
   safe choice: a held Enter on the trigger cannot reach the destructive button (owner's
   choice after the review of PR #246, following the WAI-ARIA alert dialog pattern). Tab
   reaches the confirm button. Cancel puts focus back on the button that opened it. Both
   buttons are described by the question (`aria-describedby`), so a screen reader reads it
   with the focused button.
4. **It stays open on failure.** A failed write keeps the row open, re-enables its buttons and
   shows the reason in a `role="alert"` next to them (UX-050). This now holds for scenarios
   too: the scenario confirm waits for the delete and closes only when it landed.
5. **Import's overwrite confirm is not changed.** It confirms replacing data before an import
   starts, not a delete, and has no write result to wait for; it keeps its markup.

## Consequences

- One component, one look and one behaviour for every inline destructive confirm.
- A failed scenario delete stays visible next to the action instead of only in the page
  banner.
- New strings: three record-naming confirm messages in en, cs and ru.
- The record, scenario and deactivate confirms take the `.confirm-row` look of the Properties
  confirm (raised background, spacing); the deactivate confirm sits in a flush panel. The
  scenario confirm's Yes is no longer disabled by an unrelated page action in progress; its
  Delete button still is, and writes are queued.
- Out of scope: focus after a successful delete, Escape to cancel (follow-up issues).
- No engine, parity or golden change.
