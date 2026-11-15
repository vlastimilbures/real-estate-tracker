# 0201. Buttons: one rule per role

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-15
- Source: issue #380 (UX/UI review 2026-11, tracking #392, finding F10); direction approved
  by the owner on 2026-11-15 (the issue's table); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Related: [0143](0143-one-confirm-row.md) (the inline destructive confirmation,
  unchanged), [0199](0199-icon-only-row-actions.md) (row actions, a separate rule)

## Context

1. Buttons with the same role looked and read differently from page to page: "Add
   property" was primary with a plus icon, "New scenario" primary without one; the record
   panels' Add buttons read "valuation", "lease", "mortgage block" (the verb only on the
   add form's submit, `common.addVerb`); the property modal's Cancel was outlined while every
   other form's was ghost.
2. Property detail's top bar showed two primaries for an inactive property: Activate and
   Edit property; the sample banner's Clear sample was a second primary on Properties,
   beside Add property.

## Decision

1. **One rule per role,** written as a comment next to `Button` in
   `src/ui/components/primitives.tsx` so new code follows it:

   | Role                                  | Rule                                              |
   | ------------------------------------- | ------------------------------------------------- |
   | The page's one main action (top bar)  | primary, with an icon; "Add …" for creating       |
   | Add inside a panel head or a row list | default, small, plus icon, "Add …" (full verb)    |
   | Submit in a form or modal             | primary, right-most                               |
   | Cancel / Discard in a form or modal   | ghost, left of submit                             |
   | Other page or panel actions           | default                                           |
   | Destructive confirm                   | `ConfirmRow` (ADR 0143), or a modal's danger pair |

   At most one primary button is visible per page region (the top bar, an open form, a
   modal).

2. **Add labels are full phrases,** and are the accessible names:
   `propertyDetail.addValuation` "Add valuation" / "Přidat ocenění" / "Добавить оценку",
   `propertyDetail.addLease` "Add lease" / "Přidat nájem" / "Добавить аренду",
   `propertyDetail.addMortgage` "Add mortgage block" / "Přidat hypoteční blok" /
   "Добавить ипотечный блок". The add form's submit is the same text (the panel's Add
   shows only while no form is open, so the two never show together), so
   `common.addVerb` goes.
3. **Scenarios:** `scenarios.newScenario` becomes `scenarios.addScenario`, "Add scenario" /
   "Přidat scénář" / "Добавить сценарий", primary with the plus icon; the dialog it opens
   is named the same (`scenarios.newTitle`), as Add property's is. The empty list's hint
   (`scenarios.emptyList`) names the new button: a copy change, in the wording log.
4. **The in-form row lists** (`propertyDetail.eventAddPrepayment`, `eventAddRecast`,
   `addTranche`) keep their text, already "Add …", and gain the plus icon.
5. **Property modal:** Cancel becomes ghost, left of Save, as in every other form.
6. **One primary per region:** on Property detail's top bar Edit property stays the one
   primary and Activate becomes default, like Deactivate; the sample banner's Clear
   sample (`sample.clearAction`) becomes default, as on Backup & restore. Their text,
   titles and behaviour are unchanged. (The start-up error screen's Try again and Restore
   a backup are both primary but never show together: a record that cannot be read is a
   lasting failure, `bootView`.)
7. **Destructive confirms are their own row,** not "Cancel in a form": the safe choice
   stays a default button, as visible as the destructive one. Modals (Restore a backup,
   Clear sample data, the leave guard's Discard changes) put it first, the danger button
   right-most as a submit; inline confirm rows (`ConfirmRow`, ADR 0143, and Import's
   overwrite confirm) lead with the danger button, whose question they answer. Both
   orders stay as they are.
8. **Not an Add button:** the Getting started checklist's step "Add a property" on the
   Dashboard is a link-like ghost step in a list of steps, not an action button, and keeps
   its look.

## Consequences

- Same role, same look: the reader learns one button language.
- Tests and captures that find these buttons by name use the new keys; the renamed texts
  are accessible names, so they are here, not in the wording log (ADR 0152).
- The second primary on Property detail with an open holding-costs form ("Save holding
  costs") is #385's, which replaces that editing model.
- No computed number, stored data or behaviour changes.
