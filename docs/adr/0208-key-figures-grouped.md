# 0208. Dashboard key figures: only what the tiles do not show, in three groups

- Status: Accepted
- Date: 2026-11-16
- Source: issue #383 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's grouping); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amends: [0200](0200-dashboard-kpi-strip.md) (§3: the as-of figures' subhead becomes a
  note; the tiles carry their exact value)
- Related: [0087](0087-real-lens-multiple-cumulative-cf.md) and
  [0119](0119-acquisition-funding.md) §9 (the "(nominal)" labels in the real lens, kept),
  [0202](0202-dashboard-hierarchy.md) (the panel's place, unchanged)

## Context

The Dashboard's "Key performance indicators" panel repeated three tiles (net worth at the
horizon, the net-worth multiple and levered IRR), listed nine unrelated figures in one flat
list, then four as-of figures under a subhead, every row with its label at the left edge
and its value about 900 px away at 1280 × 800.

## Decision

1. **No repeats.** Net worth at the horizon, the net-worth multiple and levered IRR leave
   the list. Their tiles keep them and carry the exact value as the value's tooltip, also
   read out after the value by a screen reader (as the net worth tile's amount, ADR 0200):
   the horizon tile the amount in Kč, the IRR tile the rate to two decimals (the multiple
   is already exact in the horizon tile's foot). A sighted keyboard user sees the rounded
   value only.
2. **Three groups**, each a heading (`h3`) under the panel title with a two-column list:
   - **Returns** (`dashboard.kpiGroupReturns`): net-worth CAGR, net yield (cap rate),
     gross yield, cash invested (only when every property has its own cash, ADR 0119 §9);
   - **Cash flow** (`dashboard.kpiGroupCashFlow`): monthly inflow (effective rent),
     monthly outflow (costs + debt service), cumulative cash to owner, first cash-flow-
     positive year;
   - **Debt** (`dashboard.kpiGroupDebt`): weighted-average interest rate, Σ principal
     repaid, debt fully repaid.
3. **Two columns** of groups where the panel is wide enough for two 320 px columns
   (1280 × 800 and 1200 × 800): Cash flow fills the right column and Debt follows Returns
   straight under it on the left. One column below (900 × 600). At 1280 × 800 with the
   sidebar open a row's label and value are at most 480 px apart; in wider windows the
   columns grow with the panel. A label's closing parenthetical ("(Yrs 1–30)") does not
   break inside, and a label keeps at least 8 px from its value.
4. **The as-of figures** (the two yields and the monthly flows) now sit in their groups.
   What they are for moves from a subhead to the panel's note, `dashboard.kpiAsOfGroup`
   (basis) followed by how the monthly figures are made (`monthlyFlowHint`, ADR 0088 §3),
   so it still names today, a date or the projection year.
5. Labels, values and the real-lens "(nominal)" labels are unchanged (ADR 0087).

## Consequences

- The panel is shorter and no figure appears both in the strip and the list.
- No computed number, stored data or export changes.
- New dictionary entries in en, cs and ru: `kpiGroupReturns`, `kpiGroupCashFlow`,
  `kpiGroupDebt`. The list's `horizon` and `irr` inputs are removed.
