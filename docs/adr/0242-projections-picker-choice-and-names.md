# 0242. Projections picker: the choice follows the list, and names are shown as stored

- Status: Accepted
- Date: 2026-11-17
- Source: issue #439 (code review 2026-11, findings R06-17 and R10-18, tracking #435); the
  plan posted on #439; non-critical decisions delegated by the owner for the 2026-11-16 night
  run
- Related: [0191](0191-state-fixes-preset-match.md) §1 (property choices carry a prefix, so
  no id equals the portfolio choice), [0180](0180-data-check-restore-asof-polish.md) §7 (the
  Dashboard filter drops a deactivated property's id), [0085](0085-properties-long-names.md)
  (long names cut with an ellipsis, full name on hover),
  [0159](0159-excel-exports-carry-their-context.md) (exports name the property by its full
  name), [0157](0157-accessibility-batch.md) (the picker becomes a list past five choices),
  [0197](0197-select-trigger-name-includes-value.md) (the picker's accessible name)

## Context

The Projections page kept its choice as a string, the portfolio or a property id, apart
from the list of active properties it must belong to. If the chosen property stopped being
listed while the page was open, the grid and the panel title fell back to the portfolio,
but the picker was given a value it did not list: no choice showed as chosen, and the
property came back as the choice if it was made active again. Leaving the page resets the
choice, so in the app this needs a change to the data while the page is open; the fix is
latent but cheap.

The picker also removed a leading "Byt " from every property name, in all three languages,
and the panel title used that shortened name. The same flat read "Dubova" here and
"Byt Dubova" on every other page and in the exported file.

## Decision

1. **The choice is a property or the portfolio, and follows the list.** The page keeps the
   chosen property's id, or none for the portfolio. When that property is no longer an
   active property, the choice becomes the portfolio (`projections.portfolio`) and stays
   there if the property is made active again. The picker's chosen value, the panel title
   and the grid always show the same thing. Choices keep their prefix (ADR 0191 §1).
2. **Names are shown as stored.** The picker and the panel title show the property's name
   exactly as the Properties list does. No part of a name is removed in any language.
3. **Long names are cut, not hidden.** A choice in the pill row is cut with an ellipsis when
   it is long; the full name shows on hover and stays the accessible name, as on the
   Properties list (ADR 0085). The list form of the picker (ADR 0157) is unchanged.
4. **Unchanged:** the projected figures, the export (file name, sheet, notes), the
   picker's accessible name (`projections.entity`, ADR 0197), the Dashboard filter.

## Consequences

- A property named "Byt …" shows its full name in the Projections picker and panel title;
  the pill row is a little wider. The panel title now matches the exported file's name.
- No computed number, stored data, export or dictionary entry changes.
- The ux-capture Projections screens change in the names shown (30-projections,
  32-projections-real, 30b-projections-entity-open) and the README projections screenshot;
  in 30-projections the wider pill row also wraps the subtitle at a different point.

## Owner review

Delegated: dropping the "Byt " shortening (some may prefer shorter pills; §3 handles width).
