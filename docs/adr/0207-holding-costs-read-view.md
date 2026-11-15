# 0207. Holding costs: a read view with Edit, like the other records

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #385 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's layout); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amends: [0199](0199-icon-only-row-actions.md) (a row action in a panel head, with a
  name of its own)
- Related: [0201](0201-button-roles.md) (one primary per region; Cancel ghost, Save primary),
  [0118](0118-data-check.md) (the Data check link to Holding costs),
  [0142](0142-row-switch-guard-busy-dialog.md) (the leave guard of a record form)

## Context

Property detail edits its records three ways: the property and its funding in a modal,
valuations, leases and mortgage blocks through a row's Edit and an inline form, and holding
costs as an always-open six-field form with its own primary "Save holding costs"
(`HoldingCostsPanel`). The open form made the page look half-edited, put a second primary
button on the page at rest, and did not show which fields fall back to the portfolio
default or what that default is.

## Decision

1. **Read view.** At rest the panel lists the six costs in two columns (a description list):
   the stored value, or for a blank field the portfolio default actually used
   (`Assumptions.defaults`), followed by `propertyDetail.holdingDefault` ("(default)",
   cs "(výchozí)", ru "(по умолчанию)"). Money in Kč, shares as percentages, rounded for
   display as elsewhere (CLAUDE.md §5); the form shows the stored value in full. Where
   the panel is narrower than two 260 px columns, the list is one column. The shaping is `holdingCostsView` (`src/ui/model/holdingCosts.ts`); no
   new maths.
2. **Edit.** The row-action pencil of ADR 0199, here in the panel head and named for the
   panel, as the panel is a single record,
   `propertyDetail.editHoldingCosts` ("Edit holding costs"), opens the same form as before
   in place, with ghost Cancel and primary Save (`propertyDetail.saveHoldingCosts`), the
   form's "Unsaved changes" state and the leave guard of every record form. The pencil is
   hidden while the form is open.
3. **Focus.** Edit moves focus to the form's first field; Cancel and a successful Save
   return the read view, move focus back to the pencil and scroll its section clear of
   the sticky top bar. A save that lands after focus has moved elsewhere leaves focus
   there. A refused value or a failed write keeps the form open, as before.
4. **Unchanged:** the fields, their validation and parsing, the save, its failure message
   in the form and the "Holding costs saved" toast, the panel's hint, and the Data check
   link, which still lands on the panel (`pd-holding`).

## Consequences

- At rest Property detail shows no form and at most one primary button.
- No computed number, stored data or export changes.
- New dictionary entries in en, cs and ru: `holdingDefault`, `editHoldingCosts`.
