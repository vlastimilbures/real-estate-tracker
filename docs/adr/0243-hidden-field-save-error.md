# 0243. Record form: a save error on a field it is not showing goes above the buttons

- Status: Accepted
- Date: 2026-11-17
- Source: issue #440 (code review 2026-11, finding R08-08, tracking #435); the plan posted on
  #440; non-critical decisions delegated by the owner for the 2026-11-16 night run
- Amends: [0098](0098-mortgage-loan-type.md) (the record form's list of hidden fields also
  decides where a refused save's message shows)
- Related: [0141](0141-form-errors-stay-in-form.md) §4 and §6 (an edit clears its field's
  error; the form-level line above the buttons), [0167](0167-drawdown-schedule.md) §1–§2 (the
  initial principal shown as the drawdown schedule's first row),
  [0116](0116-prepayments-ui-and-review-fixes.md) §11 (errors on list rows), UX-047 (a refused
  save shows on its field, else above the buttons); issue #490 (per-form error mapping, which
  keeps this behaviour)

## Context

The record form (valuations, leases, mortgages, holding costs) shows a save refused by the
store on the field the failure names, and any other failure in one line above the buttons.
It treated every one of its fields as shown, including the ones hidden for the current draft
(ADR 0098: a Standard loan hides the draws and the completion date; a Development loan shows
the initial principal as the first row of its drawdown schedule, ADR 0167, not in the grid).
A failure naming a hidden field was kept on that field, which is not rendered, and the line
above the buttons stayed empty: the save failed with nothing on screen.

The mortgage form, the only form with hidden fields, cannot reach this today. In Standard
mode both hidden fields are always blank, because the type switch clears them and a block
holding either opens as Development. A Development loan's hidden initial principal shows its
error on the schedule's first row. The gap is in the form's contract, and any later hidden
field would fall into it.

## Decision

1. **A refused save always shows its message.** The record form puts a write failure's
   message (an input rule, `inputRules.<code>`, or a database constraint,
   `writeErrors.*` / `inputRules.*`) on a field only when the form shows that field for the
   current draft. Every other message joins the line above the buttons, as a failure that
   names no field does today.
2. **What counts as shown.** The fields not hidden for the draft, plus the field a shown row
   list shows as its first row. A Development loan's initial-principal error stays on the
   schedule's first row (`propertyDetail.drawnAtStart`).
3. **Row errors are unchanged:** an error on a list item still shows on its row
   (ADR 0116 §11, ADR 0167 §2).
4. **Unchanged:**
   - errors found before the write (parsing and the cross-field check), which still go on
     their field: a hidden field is blank, and the cross-field check has no production caller
     (issue #490 removes it);
   - the property, scenario and assumptions forms, which have no hidden fields;
   - clearing a field's error when it is edited (ADR 0141 §4);
   - every dictionary entry.

## Consequences

- A save the store refuses never leaves the form silent. A message that used to be lost now
  shows above the buttons and stays there until the next save (ADR 0141 §4).
- Which fields count as shown is decided by one pure helper in `src/ui/model`, which the
  per-form error mapping of issue #490 takes over.
- No computed number, stored data, export, layout or dictionary entry changes. No ux-capture
  screen shows a failure on a hidden field, so none changes.
