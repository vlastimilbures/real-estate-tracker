# 0200. Dashboard: one compact KPI strip

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-15
- Source: issue #375 (UX/UI review 2026-11, tracking #392, finding F2); owner decision 1 of
  2026-11-15 (KPI strip first); acceptance delegated by the owner for the 2026-11-15 run
  (comment on #392)
- Amends: [0088](0088-asof-basis-labels.md) §2–§4 (horizon tile label, monthly block, net
  cash flow foot), [0195](0195-health-marker.md) §3 (the Dashboard LTV and DSCR tile foot)
- Related: [0169](0169-development-drawn-debt-display.md) (the undrawn note, kept),
  [0126](0126-degenerate-kpis.md) and [0133](0133-ltv-yield-zero-value.md) (no band, no
  marker; unchanged)

## Context

1. The top of the Dashboard took about 390 px before any chart: seven tiles in two
   differently shaped rows (2 + 1 + 1, then 4) with 24 px padding and a 116 px minimum
   height, then a "Current monthly cash flow" panel with three boxed sub-cards (capture
   `01-dashboard`).
2. The monthly panel restated a tile: its net figure is the annual net cash flow tile ÷ 12,
   and its three coloured bars were the same length, so they encoded nothing.
3. Long labels wrapped (`dashboard.netWorthInYear`), and Net worth was in full digits with
   no unit while its neighbours were in M Kč.

## Decision

1. **One strip of six compact tiles** replaces `HeroTiles`, `RiskTiles` and
   `MonthlyFlowPanel`:

   | Tile          | Label (key)                         | Value                                                    | Foot                                                                                                                            |
   | ------------- | ----------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
   | Net worth     | `dashboard.netWorth`                | M Kč, one decimal; the exact amount in Kč as its tooltip | `dashboard.stripAssetsDebt` (assets · debt, with the undrawn note of ADR 0169 after the debt); `dashboard.realTodayKc` as today |
   | At horizon    | `dashboard.stripInYear` ("In 2056") | M Kč                                                     | `dashboard.stripHorizonFoot`: multiple from projection start · horizon length · lens word                                       |
   | Levered IRR   | `dashboard.leveredIrr`              | one decimal; "n/a" with its reason as today              | `dashboard.irrFoot` (unchanged)                                                                                                 |
   | LTV           | `dashboard.portfolioLtv`            | percentage                                               | health marker and band word only (ADR 0195)                                                                                     |
   | DSCR          | `dashboard.portfolioDscr`           | multiple                                                 | health marker and band word only                                                                                                |
   | Net cash flow | `dashboard.stripNetCashFlow`        | per month, signed, with `dashboard.perMonth`             | `dashboard.stripNetCashFlowFoot`: per year, signed, and the basis                                                               |

2. **The basis is named once for the strip,** in the net cash flow foot:
   `dashboard.basisCurrent`, `dashboard.basisProjection` (the Projections year label,
   "Y5 · 2031") or `dashboard.basisOn` (a date), from the same `asOfView` basis as the
   tiles (ADR 0088, 0150). The As-of hint above the strip (ADR 0198) still gives the
   projection year's period.
3. **No figure leaves the page.** Net yield, gross yield, monthly inflow and monthly
   outflow move to the "Key performance indicators" panel, in a group of their own headed
   `dashboard.kpiAsOfGroup` with the same basis text, after the horizon figures:
   `dashboard.netYieldCap`, `dashboard.kpiGrossYield`, `dashboard.kpiMonthlyInflow`,
   `dashboard.kpiMonthlyOutflow`. The monthly figures are the same `monthlyFlow` values the
   panel showed; the annual net cash flow is in the strip's foot.
4. **Size.** Tiles are padded 10 px × 12 px; the label is one line (11 px caps), the value
   in the display face at 22 px, the foot at most two lines, so a tile is at most 96 px
   tall. Six across when the strip is at least 900 px wide (1280 × 800: about 984 px);
   three by two below (900 × 600), by a container query. The Net worth and net cash flow
   tiles are a little wider than the rest (their figures are the longest), LTV and DSCR a
   little narrower (their feet are one word). Amounts in the feet never break before
   their unit (`noBreak`).
5. **Screen reader order:** each tile reads label, value, foot, as the DOM order. The health
   marker stays decorative; its word is in the foot.
6. **Removed:** the monthly panel and its `.flow-bars` styles, `monthlyFlowLabels`,
   `netCashFlowFoot` and their dictionary keys (`dashboard.currentMonthlyCashFlow`,
   `monthlyCashFlowOn`, `monthlyEquivalentYear`, `monthlyHint`, `monthlyHintProjection`,
   `inflowLabel`, `outflowLabel`, `netCashFlowBaseline`, `annualNetCashFlow`,
   `noiMinusDebtService`, `noiMinusDebtServiceYear`, `noiMinusDebtServiceOn`,
   `debtOverValue`, `noiOverDebtService`, `grossYieldFoot`, `assetsDebtEquity`,
   `multipleFromStartMode`, `netWorthInYear`). The formula feet "Debt ÷ value" and "NOI ÷
   debt service" go from the Dashboard; the glossary behind the LTV and DSCR terms
   (Guide) still explains them, and Property detail keeps its tiles until #384.

## Consequences

- The top of the Dashboard is one row about 96 px tall instead of about 390 px; the
  section order and charts are #376.
- Net worth reads "27,1 M Kč" with the exact amount on hover, like its neighbours. The
  `kpi-networth` test id stays on the value; tests that read exact digits read its tooltip.
- `KpiTile` gains a `compact` form for the strip; Property detail's tiles are unchanged
  (#384).
- No computed number, threshold or stored data changes; every figure the tiles and the
  monthly panel showed is still on the Dashboard.
