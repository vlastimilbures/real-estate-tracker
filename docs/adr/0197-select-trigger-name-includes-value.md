# 0197. A single-select dropdown's accessible name includes the value it shows

- Status: Accepted
- Date: 2026-11-15
- Source: axe-core 4.14 (Dependabot PR #371): `label-content-name-mismatch` (serious) on
  `.property-select-trigger`, capture `30b-projections-entity-open`, all four shards;
  owner decision 2026-11-15
- Related: [0157](0157-accessibility-batch.md) (PropertySelect listbox), WCAG 2.5.3 Label in Name

## Context

1. In single mode, past the pill threshold, `PropertySelect` renders a dropdown trigger
   whose visible text is the selected option (a property name). Projections passes
   `ariaLabel={t.projections.entity}`, and that becomes the trigger's `aria-label`. The
   trigger's accessible name is then "Entity" and does not contain what is on screen, so a
   speech-input user who says the visible name cannot activate it.
2. axe-core 4.14 reports this. axe-core 4.13 did not.

## Decision

1. The trigger no longer sets `aria-label`. It sets `aria-labelledby` to two ids: a
   visually hidden span holding `ariaLabel`, then the visible value span. Its name becomes
   "Entity <shown value>" (for example "Entity Portfolio"). It contains the visible text
   and still says what the control is for.
2. Without `ariaLabel`, the trigger is named by its visible text alone, as today. Multi
   mode and the pill groups do not change.
3. No dictionary key changes. Tests that found the trigger by the name "Entity" now use
   the new name, and so does the `30b-projections-entity-open` capture step.

## Consequences

- `PropertySelect.test.tsx` asserts the name "Entity Byt 2" (purpose, then value) and the
  value alone without `ariaLabel`; axe-core 4.14 reports no violation on `30b`.
