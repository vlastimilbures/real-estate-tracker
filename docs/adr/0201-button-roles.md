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
   panels' Add buttons read "valuation", "lease", "mortgage block" (the verb only in the
   form title, `common.addVerb`); the property modal's Cancel was outlined while every
   other form's was ghost.
2. Property detail's top bar showed two primaries for an inactive property: Activate and
   Edit property.

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
   "Добавить ипотечный блок". The add form's title is the same text, so
   `common.addVerb` goes.
3. **Scenarios:** `scenarios.newScenario` becomes `scenarios.addScenario`, "Add scenario" /
   "Přidat scénář" / "Добавить сценарий", primary with the plus icon.
4. **The in-form row lists** (`propertyDetail.eventAddPrepayment`, `eventAddRecast`,
   `addTranche`) keep their text, already "Add …", and gain the plus icon.
5. **Property modal:** Cancel becomes ghost, left of Save, as in every other form.
6. **Property detail top bar:** Edit property stays the one primary; Activate becomes
   default, like Deactivate. Its text, title and behaviour are unchanged.
7. **Modals whose submit is destructive** (Restore a backup, Clear sample data, the leave
   guard's Discard changes, Import's overwrite confirm) keep Cancel / Keep editing as a
   default button beside the danger one: the safe choice stays as visible as the
   destructive one. They are the "Destructive confirm" row, not "Cancel in a form".

## Consequences

- Same role, same look: the reader learns one button language.
- Tests and captures that find these buttons by name use the new keys; the renamed texts
  are accessible names, so they are here, not in the wording log (ADR 0152).
- The second primary on Property detail with an open holding-costs form ("Save holding
  costs") is #385's, which replaces that editing model.
- No computed number, stored data or behaviour changes.
