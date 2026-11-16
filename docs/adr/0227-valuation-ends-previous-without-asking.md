# 0227. Adding a valuation ends the previous open-ended one without asking

- Status: Accepted
- Date: 2026-11-16
- Source: issue #445 (code review 2026-11, tracking #435), owner decision 2026-11-16;
  bug #436
- Amends: [0099](0099-close-previous-open-record.md) (the valuation half),
  [0144](0144-small-user-visible-corrections.md) (decision 1, valuations)
- Related: [0122](0122-valuation-persists-past-valid-to.md) (a valuation's end date is not
  read), [0163](0163-leases-never-overlap.md) (leases end the predecessor without asking),
  [0184](0184-data-layer-write-guards.md) (the close writes only the end date)

## Context

Adding a valuation while an earlier one has no end date opens a dialog: end the previous
record the day before, or keep it. Choosing "end" writes the new valuation and the old one's
`Valid to` in one transaction.

The engine does not read that date. Since ADR 0122 a valuation holds until the next one
starts: `src/engine/metrics.ts` says "Its validTo is not read: a value does not expire, the
next valuation replaces it (ADR 0122)", and the only engine use of `validTo` is validation
(`src/engine/validate.ts`: a date, not before the start). So the dialog, the choice and the
extra write maintain a date that is shown in the Valuations table and changes no number.

The prompt costs machinery in the generic record panel (`confirmAdd`, `AddPrompt`, a promise
resolver kept in state and a modal), the rule in a JSX prop, and one open bug: cancelling the
dialog keeps the form open but marks it as saved, so leaving the page then drops the typed
valuation without asking (#436). The trigger is routine (every
re-valuation). Leases already end the previous open lease without asking (ADR 0163).

## Decision

1. Adding a valuation never opens a dialog. When the new valuation has no `Valid to` and an
   earlier one for the same property is also open-ended, the app writes the day before the
   new one's start into the earlier row's `Valid to`, in the same transaction as the new row.
   Example: Byt Javorova's 10,200,000 Kč from 01.06.2026 gets `Valid to` 31.05.2027 when
   11,000,000 Kč from 01.06.2027 is added.
2. A new valuation that has its own `Valid to` changes no other row (0144 decision 1).
   Editing or deleting a valuation never changes another row.
3. `Valid to` stays optional and editable; the engine still does not read it (ADR 0122), so
   no figure changes.
4. Removed: the add-prompt mechanism of the shared record panel (`confirmAdd` / `AddPrompt`)
   and the dialog's dictionary entries (en/cs/ru), with their tests. Kept: the
   one-transaction write (`insertValuationClosingPrevious`) and its store action, now called
   directly.
5. Bug #436 goes away with the dialog and is closed by the implementing PR.
6. Tests, written failing first: adding an open-ended valuation after an open-ended one ends
   the earlier row the day before, with no dialog; a dated new valuation leaves the earlier
   row unchanged. Parity targets and golden master do not move.

## Consequences

- Effect on other issues: #436 is resolved by this change (no separate fix). #466 still has
  two close-previous rules to place (leases and valuations), now both automatic.
- No figure, parity target or golden-master change.
- Four dictionary keys are removed in en, cs and ru: `propertyDetail.closePrevValuationTitle`,
  `propertyDetail.closePrevValuationBody`, `propertyDetail.closePrevConfirm` and
  `propertyDetail.closePrevKeep`.
- Capture screen `21c-property-valuation-close-previous` changes: it shows the earlier row
  ended the day before, not the dialog.
- CSV import is unchanged: a `valuations.csv` row adds plainly, like leases.
- Correction to the approved text: it cited "0144 decision 3", but 0144's decision 3 is Docs;
  the rule this ADR changes is 0144 decision 1.
