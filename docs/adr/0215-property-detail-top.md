# 0215. Property detail: a breadcrumb and the Dashboard's tile strip

- Status: Accepted
- Superseded in part by: [0274](0274-sections-current-rule.md) (decisions 1, 2 and 4)
- Date: 2026-11-16
- Source: issue #384 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's decision); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amends: [0107](0107-property-section-nav.md) (the top bar's actions),
  [0169](0169-development-drawn-debt-display.md) (where the undrawn note sits on
  Property detail),
  [0195](0195-health-marker.md) (§3: Property detail's LTV and DSCR tiles show the
  marker and word only),
  [0200](0200-dashboard-kpi-strip.md) (Consequences: Property detail now uses the
  strip's tiles)
- Related: [0200](0200-dashboard-kpi-strip.md) (the Dashboard strip these tiles now
  follow), [0205](0205-properties-list-fits.md) (the short undrawn wording),
  [0195](0195-health-marker.md) (health marker), [0156](0156-pending-purchase-display.md)
  (a property not owned yet)
- Amended by: [0222](0222-kpi-band.md) (§3: the band look)

## Context

The top of Property detail held three buttons ("‹ All properties", "Deactivate", "Edit
property"), the Nominal / Real toggle and eight section tabs. The way back to the list was
a button among the actions. The four snapshot tiles used the large tile the Dashboard gave
up in ADR 0200: LTV sat in the Debt tile's foot while DSCR had a tile of its own, the
annual net cash flow sat in the DSCR tile's foot, and the undrawn-debt note wrapped inside
the Debt tile.

## Decision

1. **Breadcrumb.** Before the property's name, the top bar shows a link
   "Properties" (`nav.properties`) followed by a decorative "›", on the title's line. It
   returns to the Properties list as the button did (the same guarded navigation), and
   is the first focusable element of the top bar, before the actions. The "‹ All
   properties" button and its key `propertyDetail.allProperties` are removed.
2. **Actions.** "Edit property" stays the primary action, first; "Deactivate" /
   "Activate" is a default button after it, as the issue sets out (it was before it).
   Below a 1100 px window the Deactivate / Activate button shows only its icon: its label
   stays its accessible name as screen-reader text, and its tooltip still explains it.
   So the actions stay one line at 900 × 600 in Czech and Russian with Linux fonts. At
   that size they sit as one row under the title, as every page's actions do (UX-021):
   beside it they would need "Edit property" as a bare icon too, and the page's main
   action keeps its words (a decision for owner review, #415). The Nominal / Real toggle
   is unchanged.
3. **Tiles.** The Dashboard strip's compact tile (ADR 0200 §4), one row of six, three by
   two when the strip is narrower than 960 px:

   | Tile          | Label (key)                  | Value                                   | Foot                                                                                    |
   | ------------- | ---------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
   | Market value  | `propertyDetail.marketValue` | Kč, full digits (as before)             | `common.completedValue` while tranches are undrawn (ADR 0169, unchanged)                |
   | Debt          | `propertyDetail.debt`        | Kč, full digits                         | `common.undrawnDebt` ("+0,5 M Kč to draw", ADR 0205) while tranches are undrawn         |
   | Equity        | `propertyDetail.equity`      | Kč, full digits                         | —                                                                                       |
   | LTV           | `propertyDetail.ltv` (term)  | percentage                              | health marker and band word (ADR 0195)                                                  |
   | DSCR          | `propertyDetail.dscr` (term) | multiple                                | health marker and band word                                                             |
   | Net cash flow | `dashboard.stripNetCashFlow` | per month, signed, `dashboard.perMonth` | per year, then `dashboard.perYearBasis` with the tiles' as-of basis (ADR 0088, 0200 §2) |

   The monthly figure is `monthlyFlow` (`src/ui/model/dashboard.ts`), the Dashboard's
   shaping, applied to the property's snapshot. The amounts stay in full Kč: a property's
   figures are short enough, and no digit leaves the page.

4. **Section tabs** keep one row at 1280 × 800: each tab is padded 8 px a side instead
   of 12 px (Russian with Linux fonts did not fit). The Guide's section nav (ADR 0213)
   shares the style.
5. **Unchanged:** a property not owned yet shows its "Not owned yet" panel instead of the
   tiles (ADR 0156); an inactive property keeps its banner and tiles; the section tabs
   (ADR 0107) and the two charts.

## Consequences

- The top bar has one row of title and actions and one row of tabs at 1280 × 800, and
  its actions stay one line at 900 × 600 (under the title); the section tabs are one
  row at 1280 × 800 (checked by the ux capture on screen 20).
- The tiles take one row of about 96 px instead of a row of about 120 px with
  wrapped feet.
- The formula foot "LTV x %" of the Debt tile and "Net CF" of the DSCR tile become tiles
  of their own; the per-month net cash flow is new on this page and is the annual figure
  ÷ 12, as on the Dashboard.
- No computed number, stored data or export changes.
- The large tile and its hero form are no longer used anywhere: `KpiTile`'s `hero`, the
  `.tiles` grid and their styles are removed.
- Dictionary: `propertyDetail.allProperties` and `propertyDetail.netCf` are removed in
  en, cs and ru; no entry's text changes.
