# 0182. Management is charged on collected rent

- Status: Accepted
- Date: 2026-10-11
- Source: issue #150 (owner decision 2026-10-11: option A); owner answers to the E5 plan
  (2026-10-11: Q1 = management only, Q2 = snapshot and projection); Track 14 PR E5b
- Amends: SPEC.md §4.3 (holding costs) and §4.5 (`holding_t`); the parity targets of
  `.claude/rules/engine-parity.md` (target change log)
- Related: [0001](0001-behaviour-change-gate.md) (behaviour-change gate),
  [0003](0003-czech-practice-decides.md) (Czech practice decides),
  [0039](0039-golden-master.md) (golden master updated in the same commit),
  [0174](0174-golden-master-loan-events-regression-layers.md) (the KPI reference model and
  the v2 golden cases)

## Context

Holding costs are a fixed part plus two percentages of rent: management (`mgmtPctRent`) and
maintenance (`maintPctRent`). Both were charged on the **gross** (contracted) rent, in the
snapshot (`metrics.ts` `snapshotIncome`) and in every projection year (`projections.ts`
`computeRentAndCosts`), while income is the rent after the vacancy allowance. So a flat that
sits empty still paid its manager: at 100 % vacancy the sample portfolio charged 126,990 Kč
a year of percentages on rent nobody paid.

A Czech property manager (správce) bills a share of the rent actually collected (z
vybraného nájemného); an empty month earns the manager nothing. Maintenance is different:
wear, repairs and the upkeep reserve follow the flat, not the rent receipt, and do not stop
when a tenant leaves. The percentage of contracted rent stays a proxy for the size and
standard of the flat.

## Decision

1. **Management is charged on collected rent; maintenance stays on contracted rent.**
   - Snapshot (SPEC §4.3): `variable = mgmtPct × effectiveGross + maintPct × grossAnnualRent`.
   - Projection (SPEC §4.5): `holding_t = fixed0 × CPI_t + mgmtPct × effective_t +
maintPct × gross_t`.

   `effective = gross × (1 − vacancy)`, with the year's vacancy (a scenario level included).
   One formula for today's figures and the projection, so today's Dashboard NOI and DSCR
   follow the same rule as projection year 1 (owner Q2).

2. **The parity targets move** (engine run; the engine-free KPI model agrees). The old → new
   rows are in the target change log of `.claude/rules/engine-parity.md`; the golden master
   is re-recorded in the same commit (ADR 0039).
3. **The KPI reference model follows the SPEC** (`reference/kpiReference.ts`, written apart
   from the engine). Its IRR also accepts cash flows that start negative and whose running
   sums change sign once (Norström's criterion, one positive root, searched on [0, 10]),
   besides one sign change (Descartes). That case now happens in the ADR 0179 prepayment
   fixture: years 3 and 4 turn positive, and the 500,000 Kč prepayment makes year 5 negative.
   Flows with more than one root still throw.
4. **The labels and the Guide say which rent each percentage follows** (en/cs/ru):
   `assumptions.mgmt`, `assumptions.maint`, `propertyDetail.fieldMgmtPct`,
   `propertyDetail.fieldMaintPct` (accessible names, so under this ADR, not the wording log);
   the Guide's `guide.snapshotDefs.holdingCosts` (formula, meaning, example) and the worked
   examples that use its result (`noi.eg`, `netCashFlow.eg`, `dscr.eg`, `netYield.eg`), and
   `guide.projectionDefs.vacancy.meaning`.

## Consequences

- **Parity targets** (sample portfolio, base date 2026-06-07):

  | Target                            | Old                             | New                                 |
  | --------------------------------- | ------------------------------- | ----------------------------------- |
  | Annual holding costs              | 215,220                         | 208,870.5                           |
  | Net operating income              | 589,050                         | 595,399.5                           |
  | Annual net cash flow              | −57,334.2                       | −50,984.7                           |
  | Net yield (cap rate)              | 0.02050                         | 0.02072                             |
  | Portfolio DSCR                    | 0.91130                         | 0.92112                             |
  | Javorová NOI · net CF · DSCR      | 229,500 · 148,838.4 · 2.84522   | 231,948 · 151,286.4 · 2.87557       |
  | Lipová NOI · net CF · DSCR        | 179,775 · −127,030.8 · 0.585957 | 181,725.75 · −125,080.05 · 0.592315 |
  | Dubová NOI · net CF · DSCR        | 179,775 · −79,141.8 · 0.694335  | 181,725.75 · −77,191.05 · 0.701869  |
  | Cumulative cash to owner (Y1–30)  | 14,705,700.29                   | 15,020,596.50                       |
  | First year net cash flow positive | 2031                            | 2029                                |
  | Levered IRR nominal / real        | 0.061795 / 0.035898             | 0.062038 / 0.036135                 |

  The snapshot change is 15 % × 5 % vacancy × 846,600 Kč gross rent = 6,349.50 Kč. Value,
  debt, equity, LTV, gross rent, effective income, debt service, gross yield, weighted rate,
  the amortization rows, net worth nominal and real, the multiple, both CAGRs, the debt-free
  year 2052 and Σ principal 9,515,405 do not move. Projection year 1: holding costs
  223,206.60 → 216,600.63, NOI 613,549.13 → 620,155.09.

- **At 100 % vacancy** the sample's holding costs are 88,230 Kč (fixed 45,900 + 5 % ×
  846,600 maintenance), not 215,220.
- **Golden master:** 861 changed lines in 16 snapshot entries, all downstream of holding
  costs: `holdingCosts`, `noi`, `netCashFlow`, `cashToOwner`, `dscr`, `netYield`,
  cumulative cash flow, levered IRR and the first positive year, plus the whole-row hashes
  of the rows that hold them. No value, balance, equity, net worth, rent, principal or
  interest line moves (the v2 cases hash per field and show it).
- **ADR 0179 example:** the portfolio IRR with Javorová's 500,000 Kč `shortenTerm`
  prepayment moves from 0.0616724 to 0.0619133 (reference model and engine agree).
- A portfolio with no vacancy is unchanged. No stored data, migration, export format or
  tolerance changes.
