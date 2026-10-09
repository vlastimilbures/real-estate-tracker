# Czech mortgage extensions — design notes (D-04)

Status: design only, nothing is built (D-04), except §1: one-off prepayments are built,
with recasts added, as decided in ADR 0109 (which supersedes the §1 details where they
differ, e.g. the shorten-term example (b)). Written in P4c (2026-10-01) against the engine
after P4a/P4b and the P4c refactors (DR-092, DR-128). Source outline: P02 report §10; the Czech
practice checklist is P02 §3.3 (C-03, C-14, C-15).

Four features are covered:

1. Penalty-free prepayment at fixation end
2. Annual partial-prepayment allowance
3. Per-loan payment day
4. First partial-month interest

A recommended order is at the end. Legal wording marked **OWNER TO VERIFY** comes from secondary
sources (P02 §3.3 C-15: the direct fetch of Act No. 257/2016 Coll. returned HTTP 403).

## 0. The engine today: where the hooks are

| Concern               | Where (after P4a/P4b/P4c)                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Month-step kernel     | `src/engine/schedule.ts` `amortizeMonth` (split, re-amortize, payoff at maturity), `reamortizes` (trigger), `recomputeInstalment`                                        |
| Grid loops            | `buildPlainSchedule`, `buildDevSchedule` / `devMonthStep`; catch-up to baseDate `simulateToBaseDate`; plain opening `plainOpening` (closed form or replay)               |
| Calendar              | `paymentOffset`, `lastPaymentDue`, `rateOfPayment` (rate on due date `EDATE(start, p)`, D-21); `src/engine/dates.ts` `edate`, `lastGridMonthOnOrBefore`                  |
| Grid-bucketed events  | `bucketDraws` (tranches → grid month); `newDebtByMonth` (DR-092)                                                                                                         |
| Refinance chain       | `blockChain`, `spliceSuccessor` (handover row, `Refinance { month, paidOff, drawn }`), `propertySchedule`                                                                |
| Row fields            | `AmortizationRow { month, date, ratePa, instalment, interest, principal, drawn, endBalance }`; identity `end = prev − principal + drawn` (DR-092)                        |
| Projection            | `src/engine/yearGrid.ts` `yearSlice` (sums a year's rows); `src/engine/projections.ts` `buildYearRow`; `ProjectionYear.draws`                                            |
| KPIs / IRR cash flows | `src/engine/kpis.ts` `leveredCashFlows`, `principalRepaidInHorizon`; `src/engine/ownerCash.ts` `acquisitionOutflows`, `refinanceCash` (cash outside the projection rows) |
| Term and maturity     | `src/engine/amortization.ts` `termMonths` (D-08), `scheduleMonths`, `impliedMaturity` / `maturityMismatch` (D-29), `currentBalance` (closed-form FV)                     |
| Validation            | `src/engine/validate.ts` `ValidationCode`, `checkMortgage`, `LOAN_ERROR_CODES` (raise), `validateInputs` (report)                                                        |
| Scenarios             | `src/engine/scenarios.ts` `applyScenario`: overrides Assumptions only, never portfolio data (CLAUDE.md)                                                                  |
| Persistence           | `mortgage_blocks` table (`src/data/migrations.ts`), `src/data/mappers.ts` (the `draws` JSON column is the precedent), `src/data/backup.ts` `BACKUP_COLUMNS`              |
| UI                    | Mortgage form `src/ui/model/mortgageForm.ts`, `formParse.ts` (`drawsDraft`); `src/ui/pages/PropertyDetail.tsx`; `PropertyDetailPanels.tsx` `AmortizationTable`           |

The seed has no prepayments, payment day or first partial month, so every feature below must be
**inert by default**: with the new fields absent, all 105 parity targets and the golden master
stay byte-identical. That is the first test of each feature.

---

## 1. Penalty-free prepayment at fixation end

**User story.** "At my next refix I want to repay 500,000 Kč without a fee and see what it does
to my instalment, cash flow, debt-free year and IRR."

**Law and practice (OWNER TO VERIFY).** § 117 of Act No. 257/2016 Coll.: early repayment is
allowed at any time; it is fee-free at the end of the fixation period. After a prepayment the bank
either lowers the instalment (term kept) or keeps the instalment (term shortened); this is
contract-specific.

**Data model.**

```ts
interface Prepayment {
  date: IsoDate; // paid on this date
  amount: Decimal; // > 0, principal repaid
  kind: "fixationEnd" | "annualAllowance" | "other";
  effect: "lowerInstalment" | "shortenTerm"; // default lowerInstalment
}
// on LoanBase (both plain and development loans):
prepayments?: Prepayment[]; // sorted by date, 0..N per block
```

Persist as a nullable JSON column `mortgage_blocks.prepayments` (forward-only migration v7), as
`draws` is today: mapper round-trip, `BACKUP_COLUMNS`, CSV importer writes NULL (not in the CSV
schema, like draws). DR-129 applies: a form edit must not drop the column.

**Engine hooks.**

- `schedule.ts`: a `bucketPrepayments` twin of `bucketDraws` (same grid rule, `firstStepOnOrAfter`)
  gives the amount landing in each grid month. In `buildPlainSchedule` and `devMonthStep` subtract
  it from the balance **before** the month's split, clamped to the balance.
- `reamortizes` gains a `prepaid > 0 && effect === "lowerInstalment"` trigger; `shortenTerm` keeps
  the instalment and the existing payoff guard ends the loan early. `termMonths` stays the
  contract term (D-08), so the constant-maturity rule keeps working.
- New row field `prepaid: Decimal`; the row identity becomes
  `end = prev − principal − prepaid + drawn`. `drawn` (DR-092) stays "new debt", never negative.
- Opening balance: a prepayment dated on/before baseDate must be replayed. `plainOpening` routes to
  `simulateToBaseDate` when any prepayment is due by baseDate (as D-30 does for an expired
  fixation); `simulateToBaseDate` applies it on the loan's own cadence.
- Refinance order at the fixation end (`spliceSuccessor`): the prepayment applies to the
  predecessor on the handover, so `Refinance.paidOff` is the balance **after** it. Define and test
  the order "last fixed-rate payment → prepayment → successor draw".
- `projections.ts`: `yearSlice` sums `prepaid`; `ProjectionYear.prepaid`.
- `kpis.ts`: a prepayment is an investor outflow. Add it next to `acquisitionOutflows` and
  `refinanceCash` in the levered cash-flow vector; `principalRepaidInHorizon` counts it (the
  principal-conservation invariant must include it). Whether `netCashFlow` includes prepayments is
  a **decision** (recommendation: no; show it as its own column, like acquisitions).
- Scenario: "repay X at next refix" must be an **assumption-level** rule (e.g.
  `prepayAtRefix?: { amount | pctOfBalance }` on Assumptions), which the schedule applies at each
  block's fixation end. Scenarios never write prepayment rows into the portfolio.
- `validate.ts`: `NON_POSITIVE_PREPAYMENT`, `PREPAYMENT_BEFORE_START` (raise, D-17 style); an
  amount above the balance is clamped and reported (report-only code, no raise).

**UI touchpoints.** Mortgage form: a prepayments list like the draws textarea
(`formParse.ts` `drawsDraft` pattern) with kind and effect; amortization table: a "Prepaid" column;
projection grid and Excel export: "Prepaid" column; equity-change chart: paydown includes prepaid;
scenario editor: "prepay at next refix".

**Test strategy.**

- Inert default: no prepayments ⇒ golden and 105 parity targets unchanged.
- Reference model (`__tests__/reference/mortgageReference.ts`) gains prepayments; engine vs
  reference to ≤ 10⁻⁶ Kč for both effects.
- New parity cases (hand-checked, then pinned): Javorova prepays 500,000 on 2031-01-17 —
  (a) lower instalment: new instalment = PMT(4.5 %/12, 244, balance − 500,000); (b) shorten term:
  instalment 8,681.46 kept, new payoff month = NPER.
- Invariants: row identity with `prepaid`; Σ principal + Σ prepaid = opening + new debt − horizon
  balance; balance never negative.
- Refinance order case: prepayment on the successor's start date.
- KPI: IRR with and without the outflow; debt-free year moves earlier.

**Risks.** Contract-specific effect (lower instalment vs shorter term); the order of events at a
refinance; the IRR sign; a prepayment larger than the balance; interaction with a development
loan's interest-only period (recommend: reject a prepayment before completion).

**Effort.** M (engine + persistence + form); L with the scenario rule and the chart work.

---

## 2. Annual partial-prepayment allowance

**User story.** "Each year I may repay up to 25 % fee-free in the month before the contract
anniversary. Tell me when the window is and whether my planned prepayment fits."

**Law (OWNER TO VERIFY).** § 117 Act No. 257/2016 Coll.: up to 25 % once a year within the month
before each contract anniversary is fee-free (sources disagree whether 25 % of the **total** or the
**remaining** principal). Outside the windows, for contracts or refixes from 1.9.2024 the fee is
capped at 0.25 % per started year of fixation left, max 1 %.

**Data model.** Reuses `Prepayment` with `kind: "annualAllowance"`. Percentages go in Assumptions,
not in code: `prepaymentAllowance?: { pct: Rate; base: "total" | "remaining"; windowMonths: 1 }`
and optionally `earlyRepaymentFee?: { pctPerYearLeft: Rate; cap: Rate }`.

**Engine hooks.** No new schedule mechanics: the prepayment is applied exactly as in feature 1.
New pure helpers in `amortization.ts`: `anniversaryWindows(block, from, to)` (dates from
`startDate`, the contract anniversary) and `allowanceCheck(block, prepayment, balance, a)`
returning `{ inWindow, overLimit, fee }`. `validate.ts`: report-only codes
`PREPAYMENT_OUTSIDE_WINDOW`, `PREPAYMENT_OVER_ALLOWANCE` (warnings, not raises: the owner may pay
the fee). If fees are modelled, they are a cash outflow in `kpis.ts` next to the prepayment.

**UI touchpoints.** Mortgage detail: "next fee-free window" date and the allowance amount; a warning
badge on a prepayment outside the window or over the limit (UX-nnn, en/cs/ru messages).

**Test strategy.** Window dates for month-end starts (31 Jan ⇒ 28/29 Feb clamping, DR-070 rules);
25 % boundary exactly at the limit and 1 Kč over, for both bases; fee cap cases (1 year left ⇒
0.25 %; 6 years ⇒ 1 %); inert default.

**Risks.** Legal wording drift and the total-vs-remaining ambiguity (keep both configurable);
contracts before 1.9.2024 have different fee rules; the window is per contract anniversary, which a
refinance (successor block) resets.

**Effort.** S on top of feature 1 (M alone).

---

## 3. Per-loan payment day

**User story.** "My instalment is due on the 20th, not on the day the loan started. Show each
payment on its real date."

**Data model.** `paymentDay?: number` (1–31) on `LoanBase`; default = the start day (today's
behaviour). Nullable integer column `mortgage_blocks.payment_day` (migration), mapper, backup, CSV
column (P5b). Validation: `INVALID_PAYMENT_DAY` (raise) outside 1–31.

**Engine hooks.** Today every due date is `EDATE(startDate, p)` (D-21, J-03 a′). A payment day
changes only that cadence anchor:

- New helper `dueDate(block, p)` in `dates.ts`/`amortization.ts`: day `paymentDay` (clamped to month
  end) in the month of `EDATE(startDate, p)`, or the first due date after the start when the
  payment day falls before the start day.
- Replace the cadence anchor in `rateOfPayment`, `paymentOffset` / `lastPaymentDue`
  (`lastGridMonthOnOrBefore(startDate, …)` becomes "payments due by baseDate" on the new cadence),
  `currentBalance`, `simulateToBaseDate` (`edate(startDate, k)`), `impliedMaturity` (D-29).
- The grid stays on `EDATE(baseDate, m)`; row m keeps carrying payment `offset + m`, so the
  projection year buckets (D-22) do not change.
- The partial first period this creates is feature 4.

**UI touchpoints.** Mortgage form field; amortization table shows the due date next to the grid
month (two dates per row — P6 UX decision); the D-29 maturity mismatch check uses the new cadence.

**Test strategy.** Inert default (`paymentDay` absent or equal to the start day ⇒ golden
unchanged); month-end clamping (day 31 in February and April, day 29 in a non-leap February);
payment counting at baseDate when the payment day is just before/after the baseDate day; fixation
end payment still at the fixed rate (DR-101 case) with a different payment day; reference model
gains the same cadence.

**Risks.** Month-end clamping (DR-070 rules), an off-by-one in the payments counted at baseDate,
and the UI showing two dates.

**Effort.** M.

---

## 4. First partial-month interest

**User story.** "My loan was drawn on the 3rd and the first instalment is on the 20th of the next
month; the bank charged interest for the extra days. Include it."

**Data model.** `drawDate` = `startDate` (no new field) and `firstPaymentDate?: IsoDate` (default
`EDATE(startDate, 1)`, today). A day-count basis on Assumptions: `dayCountBasis?: "ACT/360" |
"ACT/365" | "30E/360"` (Q-03, **OWNER TO VERIFY** against a statement; ACT/360 adds about 1.4 %
to annual interest).

**Engine hooks.**

- One isolated pure function `accruedInterest(balance, ratePa, from, to, basis)` (new
  `src/engine/dayCount.ts`), so the day-count stays out of the period-based kernel.
- In `buildPlainSchedule` / `devMonthStep`, the first payment row after the draw adds the broken
  period interest (from `drawDate` to one month before `firstPaymentDate`) as extra interest with no
  principal. Banks usually collect it separately: it changes debt service and cash flow, not the
  balance, so the row identity is unaffected.
- Affects only loans drawn after baseDate: for a running loan the first payment is in the past and
  the opening balance does not change (`simulateToBaseDate` needs no change).
- `yearSlice` and KPIs pick it up through `interest`.

**UI touchpoints.** Mortgage form: "first payment date" (optional); amortization table: the first
row's interest shows the broken period (tooltip); Assumptions page: day-count basis.

**Test strategy.** Inert default (seed loans all started before baseDate ⇒ no change); hand-checked
cases for each basis (e.g. 3,000,000 at 5 % for 17 days: ACT/360 = 7,083.33, ACT/365 = 6,986.30);
a future loan in the mixed fixture; February and leap-year spans.

**Risks.** Introduces a day-count into a period engine (contained in one function); unknown bank
convention (Q-03); whether the bank capitalizes the broken-period interest instead of collecting
it (then it does change the balance — make it an option only if a statement shows it).

**Effort.** M (S once feature 3's cadence exists).

---

## 5. Recommended order

1. **Prepayment at fixation end (M/L).** Most material to the owner's decisions (the next refix);
   establishes the `Prepayment` record, the `prepaid` row field and the cash-flow treatment.
2. **Annual allowance (S).** Validation and windows on top of feature 1.
3. **Per-loan payment day (M).** Calendar-only change; needed before feature 4 is exact.
4. **First partial-month interest (M, or S after 3).** Only affects future loans; needs the Q-03
   day-count answer first.

Each feature is a separate decision (D-xx) with failing tests first and an inert-default golden
check; features 1 and 2 also need a D-03 entry only if a seed target moves (none should).

---

## 6. Decisions needed before Phase 5

| ID   | Question                                                           | Evidence (P1 and since)                                                                                                                                                                                                                                                                                                                                  | Options                                                              | Recommendation                                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J-07 | Runtime validation at the DB / JSON boundary                       | DR-037 (Medium): `src/data/mappers.ts:102-131, 177-300` accepts `D("NaN")` / `"Infinity"`, rolls invalid dates, one bad row fails the whole load; scenario-overrides JSON unversioned. Since P4b the engine already has hand-rolled typed validation (`src/engine/validate.ts`, 419 lines, 19 codes, D-36/D-37/D-38) that the mapper boundary can reuse. | (a) hand-rolled type guards; (b) `zod` (runtime dependency, D-02)    | **(a).** The value rules already exist in `validateInputs`; the mapper only needs shape/parse guards (decimal string, ISO date, JSON array of draws, overrides with a version field). Estimated well under the ~300-line threshold; no new runtime dependency. |
| J-12 | Czech-Excel CSV files (`;` delimiter, decimal comma, Windows-1250) | DR-036 (Medium): `src/import/csv.ts:157-187, 267-274` — decimal comma gives the generic `invalidNumber`, Papa `errors` are dropped, CP1250 mojibake is accepted silently.                                                                                                                                                                                | (a) strict rejection with a precise message; (b) auto-detect/convert | **(a)** in P5b: detect `;` as the delimiter, a decimal comma, and replacement characters / CP1250 byte patterns, and reject with a message naming the fix ("save as CSV UTF-8, comma-separated"). (b) to the backlog.                                          |
| J-16 | Excel export library                                               | Closed by **D-15** (2026-09-30): keep `exceljs@4.4.0`, add `pnpm.overrides` for `brace-expansion` and `uuid`; P5b applies them and re-runs `pnpm audit --prod`.                                                                                                                                                                                          | —                                                                    | No decision needed; restated for completeness.                                                                                                                                                                                                                 |
