# 0241. Property form: the typed values stay after a failed save

- Status: Accepted (owner-delegated, night run 2026-11-16; owner review pending)
- Date: 2026-11-17
- Source: issue #438 (code review 2026-11, findings R08-05 and R08-09, tracking #435); the
  plan posted on #438; non-critical decisions delegated by the owner for the 2026-11-16 night
  run
- Related: [0095](0095-assumptions-save-row.md) (the Assumptions form keeps its input and
  its unsaved state after a failed save), [0184](0184-data-layer-write-guards.md) §3 (the
  edit form's separate read of address and garage), UX-029 (unsaved input blocks Esc and
  backdrop clicks); issue #489 (one submit helper for every form, which keeps this
  behaviour)

## Context

The edit form for a property copied the stored values into its fields, and into the values
it compares against to know whether anything is unsaved, every time the portfolio in the
store changed. A failed write reloads the store, so the portfolio changes. After a save
refused by the database (not by an input rule, which is checked before the write and does
not reload), the stored values came back into the fields while the error was shown: what
was typed was gone, the form no longer counted as unsaved, and Esc closed it without a
prompt. The form's save also had no `catch`, so a save that threw showed nothing, where the
other forms show the failure. Today the store turns every write failure into a returned
result rather than throwing, so a thrown save cannot happen; the `catch` is kept to match
the record and scenario forms and the shared submit helper planned in issue #489.

## Decision

1. **The form takes the stored values once.** The edit form fills its fields from the
   stored property when it opens, and does not refill them when the store changes while it
   is open. The separate read of address and garage (ADR 0184 §3) runs once when it opens;
   a store change does not start it again.
2. **A failed save keeps the input.** After any failed save, whether the write was refused
   or the save threw, the typed values stay in the fields, the form stays open and counts
   as unsaved, so Esc and backdrop clicks are still ignored (UX-029). The failure is shown
   as today: on its field when it names one, otherwise above the buttons.
3. **A thrown save is shown.** A save that throws is turned into a write failure and shown
   like a refused one, as in the record and scenario forms.
4. **Unchanged:** the add form, the mortgage, lease, valuation, cost, scenario and
   assumptions forms (they already keep their input); the Acquisition section's open state;
   the leave-guard registration (issue #489).

## Consequences

- A change made elsewhere to the same property while its form is open shows in the form
  only after it is opened again.
- No computed number, stored data, export, layout or dictionary entry changes. The
  ux-capture screens show the form before any save and do not change.
