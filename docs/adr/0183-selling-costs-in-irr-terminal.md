# 0183. Selling costs lower the levered IRR's terminal value

- Status: Accepted
- Date: 2026-10-11
- Source: issue #148 (owner decision 2026-10-11: option B2 + D); owner answer to the E5 plan
  (2026-10-11: Q5 = no note under the IRR); Track 14 PR E5c
- Amends: SPEC.md §2 (the Assumptions shape) and §4.6 (the levered IRR's terminal value);
  [0091](0091-guide-about-wording.md) (the Guide's IRR wording)
- Related: [0001](0001-behaviour-change-gate.md) (behaviour-change gate),
  [0119](0119-acquisition-funding.md) §6 (`acquisitionCostPct`, the buy-side counterpart,
  stays engine-only), [0148](0148-restore-rules-vs-stored-data.md) (restore rules),
  [0153](0153-honest-startup-failures.md) (what a stopped upgrade reports),
  [0174](0174-golden-master-loan-events-regression-layers.md) (the KPI reference model)

## Context

The levered IRR ends with the projected equity at the horizon: value minus debt, as if the
portfolio were sold for its full projected value (SPEC §4.6). A real sale costs money: a
Czech agent usually charges 3–5 % of the price, plus legal and escrow fees. The buy side
already has a cost rate (`acquisitionCostPct`, ADR 0119 §6), the sell side had none, so the
IRR was flattered. The Guide said so in brackets ("no selling costs or tax"), but did not
say why tax is left out.

The owner chose B2 + D (#148): a selling-cost rate that only the IRR's terminal value uses,
and a clearer statement of what the IRR leaves out. Net worth, the multiple and CAGR stay
holding figures: they show what the portfolio is worth if you keep it, not what a sale
would leave.

## Decision

1. **A new assumption, `sellingCostPct`** (0–1 of the projected market value at the
   horizon; default 0). The levered IRR's last entry becomes
   `cashToOwner_N + equity_N − value_N × sellingCostPct`, on the market value (`value`),
   not on `reportedValue`. The real IRR deflates that entry by `CPI_N` as before. Undefined
   means 0, so every fixture and the parity targets are unchanged.
2. **Nothing else moves.** Net worth (nominal and real), the multiple, both CAGRs, cumulative
   cash to owner, the projection rows and the snapshot ignore the rate. It is not a scenario
   lever: every scenario uses the base rate (`applyScenario` copies the base assumptions).
3. **Range 0–1**, checked by the engine (`RATE_OUT_OF_RANGE` on `sellingCostPct`), by a
   CHECK constraint in the database and by restore (through the engine rules).
4. **Stored in migration v11:** `assumptions.selling_cost_pct TEXT NOT NULL DEFAULT '0'`
   with the CHECK `assumptions_selling_cost_0_to_1` (0–1). The default fills the one
   existing row, so the owner's numbers do not change. The migration runner's safety rules
   apply as for every migration: integrity check, a verified pre-migration copy
   (`pre-migration-v10-to-v11-<stamp>`), then one transaction with its
   `schema_migrations` row. It is forward-only: to go back, restore the pre-migration copy
   or a JSON backup. An older app refuses a v11 database (`DB_NEWER`) and a v11 backup
   (`BACKUP_NEWER`), and changes nothing.
5. **Backups carry the column.** A backup from before v11 restores with 0. Assumptions are
   not a CSV table (`docs/csv-import.md`), and the Excel exports hold no assumptions, so no
   import or export format changes.
6. **The Assumptions form gets the field** "Selling costs at horizon" (`assumptions.sellingCost`,
   a new accessible name, with `assumptions.sellingCostHelp`), after the post-fixation reset
   rate, in en/cs/ru. The help says that only the levered IRR uses it.
7. **The Guide says what the IRR leaves out and why** (`guide.returnsDefs.irr.meaning`, amends
   ADR 0091): the terminal equity is net of the selling costs set in the Assumptions (0 %
   unless set), and the figure is before income tax, because rental income tax depends on
   the expense method (actual costs or the 30 % flat allowance). No caption is added under
   the IRR figure (owner Q5). `docs/model-limitations.md` says the same.

## Consequences

- **Sample portfolio at 4 %:** levered IRR nominal 0.062038 → 0.060819, real 0.036135 →
  0.034945 (engine; the engine-free KPI reference model agrees to 1e-9). Net worth stays
  93,182,810.46 Kč. At 100 % the IRR still exists (nominal −0.010420).
- At 0 the engine output, the parity targets and the golden master are unchanged.
- The database schema moves to v11; the Rust migration fixture is regenerated and the
  bundled-SQLite test checks the new CHECK.
- Selling costs are one portfolio-wide rate. A per-property rate, a sale before the horizon
  and capital-gains tax stay out of scope (SPEC §10).
