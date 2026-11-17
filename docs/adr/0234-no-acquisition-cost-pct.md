# 0234. No engine-only acquisition cost percentage

- Status: Accepted
- Date: 2026-11-16
- Source: issue #454 (code review 2026-11, tracking #435), owner decision 2026-11-16,
  option A
- Amends: [0119](0119-acquisition-funding.md) §5 and §6 (the transaction costs of a future
  buy are the entered ones, else 0; the engine-only fallback rate is gone)

## Context

ADR 0119 §6 kept `Assumptions.acquisitionCostPct` as the engine-only fallback for the
transaction costs of a property bought after baseDate whose funding record has none. No
column, form, mapper, CSV column or backup field sets it, so in the app it is always
undefined and the fallback is always 0. It still carried a validation range rule, a
parameter through the acquisition maths, a SPEC.md precedence paragraph, tests in five
files and one golden-master case that set it to 4 %.

With the field removed, the golden master, parity targets and reference models give one
failure out of 374: that golden case, whose KPIs then come out byte-identical to the
existing `mixed fixture` entry. No parity target moves.

## Decision

1. The engine input `Assumptions.acquisitionCostPct` is removed. A property bought after the projection start uses the transaction costs on its funding record, or 0 when none are entered (today's result, since the input could never be set).
2. Removed with it: its range rule in validation, the fallback parameter in the acquisition maths, the SPEC.md precedence paragraph, and its tests in five files.
3. The golden-master case that set it to 4 % (`golden.test.ts:252`) is deleted with its snapshot lines (a removed input, not a moved number); every other golden case, the parity targets and the reference models are unchanged.
4. A default transaction-cost percentage, if ever wanted, returns as a real Assumptions field through the roadmap.

## Consequences

- `acquisitionSummary(property, portfolio)` loses its now-unused `assumptions` parameter;
  only its signature changes (callers in `ownerCash.ts`, `useEngine.ts` and tests).
- The down-payment tests that used the rate as their isolation knob vary the funding
  record's entered transaction costs instead (0 and 348,000 Kč give the same 3,800,000 and
  4,148,000 Kč outflows as before).
- A failing-first test pins that a stray `acquisitionCostPct` value moves nothing.
- The reference KPI model (`kpiReference.ts`) is unchanged; its adapter no longer flags
  acquisition costs as unsupported.
- No figure in the app, no stored data, CSV, backup, form or translation changes. No target
  change log row: no target moves.
