# 0199. Row actions: one icon-only style on every list

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-15
- Source: issue #374 (UX/UI review 2026-11, tracking #392, finding F10); owner decision 4
  of 2026-11-15 (row actions icon-only with a tooltip on every list); acceptance delegated
  by the owner for the 2026-11-15 run (comment on #392)
- Amends: [0085](0085-properties-long-names.md) (icon-only row actions at every width, not
  only below 1100 px)
- Related: [0143](0143-one-confirm-row.md) (the inline delete confirmation, unchanged),
  [0173](0173-record-panel-races-confirm-focus.md) (focus after a confirmed delete)

## Context

1. The same row actions looked different on every list: Properties and the record panels
   (Valuations, Leases, Mortgage blocks) used a pencil or trash icon plus a label, Scenarios
   used labels without icons, and a loan event row in the mortgage form used a text button.
2. A labelled pair costs about 170 px per row, part of why the NOI column is cut off on
   Properties at 1280 px (`10-properties`).
3. Delete had a red outline on every row, so the destructive action had the same visual
   weight as everything else on the row.
4. Below 1100 px Properties already hid the labels and kept them for screen readers
   (ADR 0085) — the rule existed for one list at one width.

## Decision

1. **One `RowAction` primitive** (`src/ui/components/RowActions.tsx`) for every row action,
   inside a `RowActions` group: an icon-only quiet button — pencil (edit), copy (duplicate),
   trash (delete, and remove a loan event row).
2. **Names do not change.** The button's accessible name is its text, as today:
   `common.edit`, `common.delete`, `scenarios.duplicate`, `propertyDetail.eventRemove`. That text
   is the tooltip, so the visible label and the accessible name are the same (WCAG 2.5.3).
   The Properties buttons' extra `title` (`properties.editProperty`,
   `properties.deleteProperty`) goes: a native `title` shows on hover only and would
   differ from the name. `properties.deleteProperty` is then unused and removed;
   `properties.editProperty` stays (Property detail's Edit property button, Data check).
3. **Tooltip on hover and on keyboard focus** (`:hover`, `:focus-visible`). It sits to the
   left of the button, on the button's own line, so it stays inside the row: a sticky table
   header or the edge of a table's scroll region never covers it. It meets WCAG 1.4.13:
   - _hoverable_: a transparent bridge joins it to the button, so the pointer can move onto
     it;
   - _persistent_: it stays while the button is hovered or focused;
   - _dismissible_: Escape hides it without moving focus, whether it shows for focus or
     for hover (focus may be elsewhere then). That Escape stops there; a second Escape
     reaches the dialog or form as before.
     Because the tooltip may cover the button beside it, a click on the tooltip only hides
     it and never runs the hovered action; the next click reaches the button underneath.
4. **Size:** 28 × 28 px targets with 4 px between them (WCAG 2.5.8 asks at least 24 × 24).
   A table's actions cell shrinks to its buttons with 6 px padding each side, so the column
   is at most about 72 px with two actions and 104 px with three.
5. **Delete is neutral at rest** (the same quiet ink as Edit) and turns red on hover and
   focus (`--negative` on `--negative-wash`). The inline "Yes, delete / Cancel"
   confirmation (`ConfirmRow`, ADR 0143) and the focus after it (ADR 0173) are unchanged.
6. **Disabled while a save runs** stays (Scenarios `busy`).
7. The `@media (max-width: 1100px)` rule for `.row-actions .btn-label` is removed; the rule
   is now general.

## Consequences

- Properties, the record panels, Scenarios and the loan event rows show the same three
  icons; each row is narrower, which the Properties list fit (#379) builds on.
- A sighted mouse user sees the action's name on hover instead of always; a keyboard user
  sees it on focus. Screen readers hear the same names as before.
- Add, Cancel and submit buttons and the chart "Table" / "Export to Excel" buttons are out of
  scope (#380).
- Layout only: no computed number, dictionary text or stored data changes.
