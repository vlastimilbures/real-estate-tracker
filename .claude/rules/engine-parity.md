---
paths:
  - "src/engine/**"
---

> Targets change only through an accepted ADR (ADR 0001; Czech banking practice decides where
> a formula is in doubt, ADR 0003), with an old → new row in the target change log below and
> the golden-master snapshot updated in the same commit (ADR 0039).

# Engine parity targets & sample portfolio

Loaded automatically when Claude works on `src/engine/**`. These are the verified targets the
engine must reproduce for the fictional sample portfolio below. Treat any mismatch as a bug in
the engine, not in the target. The parity tests read these numbers from
`src/engine/__tests__/support/seed.ts`; keep the two in step.

The targets are cross-checked three ways: an independent mortgage reference model
(`src/engine/__tests__/reference/`, imports nothing from the engine), invariant and
property-based tests (Σ principal = starting debt, conservation over random loans and
leases), and the full-precision golden master (`src/engine/__tests__/golden.test.ts`).

**Tolerances:** money within **±1 Kč**; ratios/rates/multiples (LTV, DSCR, yields, CAGR, IRR,
weighted-avg rate, net-worth multiple) within **±0.0001**. Base date **2026-06-07**.

## Parity targets

### Current snapshot — portfolio

| Metric                                 | Target        |
| -------------------------------------- | ------------- |
| Total current market value             | 28,730,000    |
| Total outstanding debt                 | 9,515,405.13  |
| Total equity                           | 19,214,594.87 |
| Portfolio LTV                          | 0.33120       |
| Annual rental income (gross)           | 846,600       |
| Effective gross income (after vacancy) | 804,270       |
| Annual holding costs                   | 215,220       |
| Net operating income (NOI)             | 589,050       |
| Annual debt service                    | 646,384.2     |
| Annual net cash flow                   | −57,334.2     |
| Gross yield                            | 0.02947       |
| Net yield (cap rate)                   | 0.02050       |
| Portfolio DSCR                         | 0.91130       |
| Weighted-avg interest rate             | 0.035226      |

### Current snapshot — per property

| Property     | Value      | Debt         | NOI     | Debt service | Net CF     | DSCR     |
| ------------ | ---------- | ------------ | ------- | ------------ | ---------- | -------- |
| Byt Javorova | 10,200,000 | 1,642,907.31 | 229,500 | 80,661.6     | 148,838.4  | 2.84522  |
| Byt Lipova   | 8,925,000  | 5,116,588.94 | 179,775 | 306,805.8    | −127,030.8 | 0.585957 |
| Byt Dubova   | 9,605,000  | 2,755,908.88 | 179,775 | 258,916.8    | −79,141.8  | 0.694335 |

### Amortization (Byt Javorova; rate 1.69%, instalment 6,721.8; baseDate balance 1,642,907.31)

| Month | Interest | Principal | End balance | Note                                                                                    |
| ----- | -------- | --------- | ----------- | --------------------------------------------------------------------------------------- |
| 1     | 2,313.8  | 4,408.0   | 1,638,499.3 | annuity split                                                                           |
| 55    | 1,965.7  | 4,756.1   | 1,391,012.7 | at the fixed 1.69%                                                                      |
| 56    | 1,959.0  | 4,762.8   | 1,386,249.9 | **payment due on the fixation end 2031-01-17 → still 1.69%, instalment 6,721.8 (D-21)** |
| 57    | 5,198.4  | 3,483.0   | 1,382,766.9 | **rate resets to 4.5%, instalment re-amortizes to ≈8,681.46 over 244 months (D-21)**    |
| 300   | 32.4     | 8,649.0   | 0           | fully amortized                                                                         |

### 30-year projection — portfolio

| KPI                                    | Target                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Net worth at horizon (nominal)         | 93,182,810.46                                                                     |
| Net worth at horizon (real, ÷1.025^30) | 44,424,223.27                                                                     |
| Net-worth multiple                     | 4.8496×                                                                           |
| Net-worth CAGR (nominal)               | 0.0540                                                                            |
| Net-worth CAGR (real)                  | 0.0283                                                                            |
| Cumulative cash to owner (Yrs 1–30)    | 14,705,700.29                                                                     |
| First year net cash flow positive      | 2031                                                                              |
| Year portfolio debt fully repaid       | 2052                                                                              |
| Levered IRR (nominal)                  | 0.061795                                                                          |
| Levered IRR (real)                     | 0.035898                                                                          |
| **Σ principal repaid, Yrs 1–30**       | **9,515,405** (= initial debt — invariant: principal retires 100% of the balance) |

> The last invariant is the single most important correctness check: the sum of all principal
> paid over the horizon must equal the starting debt. A classic spreadsheet mistake computes
> principal as 0 so the balance never amortizes — this test is the tripwire against it.

## Sample portfolio (seed data / test fixtures)

Fictional (ADR 0081). Use this exact data to drive the parity tests; it is also the first-run
seed (`src/data/seed.ts`). Dates ISO.

**Assumptions:** baseDate 2026-06-07; appreciation 0.04; rentIndexation 0.03; vacancy 0.05;
postFixationResetRate 0.045; horizonYears 30; inflation 0.025.
Defaults: propertyTaxYr 2550; insuranceYr 2550; mgmtPctRent 0.15; maintPctRent 0.05;
svjMonthly 1700; otherYr 0.

**Properties** (name, purchaseDate, purchasePrice, sizeM2, type):

- Byt Javorova, 2015-06-01, 4,080,000, 71, 3 bedroom
- Byt Lipova, 2022-01-15, 7,225,000, 55, 1 bedroom
- Byt Dubova, 2023-02-01, 6,375,000, 47, 1 bedroom

**Mortgage blocks** (property, startDate, initialPrincipal, fixationYears, ratePa, instalment):

- Javorova, 2021-01-17, 1,912,500, 10, 0.0169, 6,721.8
- Lipova, 2022-01-15, 5,610,000, 7, 0.0359, 25,567.15
- Dubova, 2024-03-12, 3,034,500, 7, 0.0449, 21,576.4

**Valuations** (property, validFrom, marketValue): all validFrom 2026-06-01

- Javorova 10,200,000 · Lipova 8,925,000 · Dubova 9,605,000

**Leases** (property, startDate, endDate, monthlyRent):

- Javorova, 2025-09-01, —, 27,200
- Dubova, 2025-07-01, —, 21,675
- Lipova, 2025-09-01, 2026-08-30, 21,675 (the lease in force at baseDate)
- Lipova, 2026-09-01, —, 23,205 (in force from 2026-09-01; not in force at baseDate)

**Holding costs** (per property; override of the SVJ default): propertyTaxYr 2550,
insuranceYr 2550, mgmtPctRent 0.15, maintPctRent 0.05, **svjMonthly 850**, otherYr 0,
for each of the three properties.

> Note: Lipova's rent in force at baseDate (2026-06-07) is **21,675** (the lease ending
> 2026-08-30), not 23,205 — the snapshot must pick the lease valid _on_ the base date. This is a
> good effective-dating test. The projection follows the leases month by month (D-80): grid
> months 1–2 (07-07, 08-07) at 21,675, from month 3 (09-07) at 23,205, indexed from year 1.

## Target change log

Every change to a target above needs a row here, backed by an accepted ADR. Update the
golden-master snapshot in the same commit (ADR 0039). Changes before the public release are
described in the ADRs themselves (ADR 0021 schedule calendar, ADR 0080 lease steps).

| Target                                  | Old                                 | New                                          | ADR  | Date       |
| --------------------------------------- | ----------------------------------- | -------------------------------------------- | ---- | ---------- |
| Every money target (sample re-based)    | previous sample portfolio's figures | engine values for the ×0.85 fictional sample | 0081 | 2026-10-03 |
| Ratio, rate, IRR, CAGR and year targets | —                                   | unchanged                                    | 0081 | 2026-10-03 |
