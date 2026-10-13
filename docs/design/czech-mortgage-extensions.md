# Czech mortgage extensions — design notes (D-04)

Status: design only (D-04) for §§2–4. §1 is built: see ADR 0109, ADR 0116 and SPEC §4.4.
Written in P4c (2026-10-01) against the engine after P4a/P4b and the P4c refactors (DR-092,
DR-128). The source outline and the Czech practice checklist (C-03, C-14, C-15) were in the
retired refactor archive (ADR 0081).

Four features are covered:

1. Penalty-free prepayment at fixation end
2. Annual partial-prepayment allowance
3. Per-loan payment day
4. First partial-month interest

A recommended order is at the end. Legal wording marked **OWNER TO VERIFY** comes from secondary
sources (C-15: the direct fetch of Act No. 257/2016 Coll. returned HTTP 403).

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

**Built** (ADR 0109, ADR 0116; SPEC §4.4). One-off prepayments, with an effect of
`lowerInstalment` or `shortenTerm` and an optional entered fee, are data on a loan block, on
plain and development loans, together with maturity changes (recasts). The user story ("at my
next fixation end I want to repay 500,000 Kč…") is answered per property by the KPIs and the
interest saved. Where the build differs from the original design:

- No `kind` field: a prepayment is not tagged as fixation-end or allowance (ADR 0109 §1).
- Stored by migration v9, not v7.
- `EVENT_BEFORE_START` (shared with recasts), not `PREPAYMENT_BEFORE_START`; an event after
  the schedule's end is `EVENT_AFTER_SCHEDULE_END`.
- A prepayment before a development loan's completion is allowed, not rejected: during
  interest-only both effects lower the payment (ADR 0109 §5).
- The `shortenTerm` example (b) keeps the reset instalment, not 8,681.46 (ADR 0109 §5).
- Prepayments are owner cash outside net cash flow and DSCR; cumulative cash flow and the IRR
  subtract them with their fees (ADR 0109 §11).
- Not built: the scenario rule "repay X at the next fixation end" (`prepayAtRefix` on
  Assumptions). Scenarios change only Assumptions and a prepayment belongs to one loan, so
  the what-if waits for per-property scenario overrides (DR-077; #158).

---

## 2. Annual partial-prepayment allowance

**User story.** "Each year I may repay up to 25 % fee-free in the month before the contract
anniversary. Tell me when the window is and whether my planned prepayment fits."

**Law (OWNER TO VERIFY).** § 117 Act No. 257/2016 Coll.: up to 25 % once a year within the month
before each contract anniversary is fee-free (sources disagree whether 25 % of the **total** or the
**remaining** principal). Outside the windows, for contracts or new fixations from 1.9.2024 the fee is
capped at 0.25 % per started year of fixation left, max 1 %.

**Data model.** Reuses the built `Prepayment` (it has no `kind` field, so an allowance
prepayment is recognised by its date window). Percentages go in Assumptions,
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

**UI touchpoints.** Mortgage form field; the D-29 maturity mismatch check uses the new cadence.
The amortization table already shows each row's due date instead of the grid date (ADR 0164);
with a payment day, `dueDate` follows that day.

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
`EDATE(startDate, 1)`, today). No day-count option: a statement check found 30E/360 (Q-03,
ADR 0021), which regular periods already use, so a broken period counts its days the 30E/360
way. Tranches and prepayments between two due dates are broken periods too (#153); the same
helper covers them.

**Engine hooks.**

- One isolated pure function `accruedInterest(balance, ratePa, from, to)` (30E/360 days) (new
  `src/engine/dayCount.ts`), so the day-count stays out of the period-based kernel.
- In `buildPlainSchedule` / `devMonthStep`, the first payment row after the draw adds the broken
  period interest (from `drawDate` to one month before `firstPaymentDate`) as extra interest with no
  principal. Banks usually collect it separately: it changes debt service and cash flow, not the
  balance, so the row identity is unaffected.
- Affects only loans drawn after baseDate: for a running loan the first payment is in the past and
  the opening balance does not change (`simulateToBaseDate` needs no change).
- `yearSlice` and KPIs pick it up through `interest`.

**UI touchpoints.** Mortgage form: "first payment date" (optional); amortization table: the first
row's interest shows the broken period (tooltip).

**Test strategy.** Inert default (seed loans all started before baseDate ⇒ no change); hand-checked
30E/360 cases (e.g. 3,000,000 at 5 % for 17 days = 7,083.33);
a future loan in the mixed fixture; February and leap-year spans.

**Risks.** Introduces a day-count into a period engine (contained in one function); whether the bank capitalizes the broken-period interest instead of collecting
it (then it does change the balance — make it an option only if a statement shows it).

**Effort.** M (S once feature 3's cadence exists).

---

## 5. Recommended order

1. **Prepayment at fixation end.** Built (ADR 0109, ADR 0116).
2. **Annual allowance (S).** Validation and windows on top of feature 1.
3. **Per-loan payment day (M).** Calendar-only change; needed before feature 4 is exact.
4. **First partial-month interest (M, or S after 3).** Only affects future loans and tranches;
   the day count is known (30E/360, Q-03).

Each feature is a separate decision (D-xx) with failing tests first and an inert-default golden
check; features 1 and 2 also need a D-03 entry only if a seed target moves (none should).
