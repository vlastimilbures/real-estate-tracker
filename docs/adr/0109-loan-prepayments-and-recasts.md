# 0109. Loan prepayments and recasts

- Status: Accepted
- Date: 2026-10-03
- Source: issue #32 (pre-release review 2026-10, F3); design `docs/design/czech-mortgage-extensions.md` §1 (D-04)
- Amended by: ADR 0116, ADR 0120 (§6: a tranche on payment `q`), ADR 0136 (§5: `shortenTerm`
  keeps the instalment the next payment pays), ADR 0137 (§6: payment `q` pays at least
  its interest)

## Context

A borrower can repay extra principal on a loan at any time. Under Czech law this is free of
charge at the end of a fixation (§ 117 of Act No. 257/2016 Coll., OWNER TO VERIFY). After the
prepayment the bank either lowers the instalment and keeps the maturity, or keeps the
instalment and shortens the term. The engine had no way to model either. The owner also wants
flexibility after a shortened term: they want to be able to lower the instalment again later
and prolong the maturity, or do the reverse. The owner decided the open points on 2026-10-03.

This change covers the engine and persistence (#32a). The form, the `Prepaid` column, the
interest saved and the clamp warnings come in #32b, and both ship in the same release.

## Decision

1. **Prepayment.** A loan block carries `prepayments?: Prepayment[]`, where
   `Prepayment = { date, amount, effect: "lowerInstalment" | "shortenTerm", fee? }`.
   - Prepayments apply to plain and development loans.
   - They never make a plain loan a development loan, so plain loans stay on the parity path.
   - There is no `kind` field.
   - The annual 25 % allowance, the payment day and partial-month interest stay on the roadmap.
   - The fee is the amount the owner enters. Nothing is calculated automatically.
   - There is no CSV column: prepayments cannot be imported.
2. **Recast.** A loan block carries `recasts?: LoanRecast[]`, where
   `LoanRecast = { date, maturity }` or `{ date, instalment }` (exactly one of the two).
   - From the first payment after the date, the bank re-amortizes the balance:
     - to the new **maturity**: a later maturity lowers the instalment, an earlier one raises it;
     - to the new **instalment**: the maturity follows from NPER.
   - A full renegotiation (new rate, new lender, cash-out) stays a successor block.
3. **Placement.** Every event maps to the loan's own payment number. That is the first payment
   due on or after the event date, and the event applies **after** that payment. The same
   rule holds before and after baseDate, with one exception (ADR 0116):
   - An event dated after the last payment due on or before baseDate, and on or before
     baseDate itself, is history. It settles right after that last payment, so its
     placement depends on baseDate by less than one payment period.
   - Within one payment period the order is: scheduled payment, then prepayments (in date
     order), then recast.
   - A re-amortization takes effect from the next payment.
   - A prepayment dated between two due dates is applied after the next due payment, so
     interest is overstated by less than one month. This stays until partial-month interest
     is modelled.
4. **Effective maturity.** The schedule carries the loan's effective last payment number.
   - It starts at the contract term (D-08 unchanged).
   - Constant-maturity re-amortization at a fixation reset or after a rate-shock revert uses
     the effective maturity, not the contract one.
5. **Effect of a prepayment.** The amount applied is `min(amount, balance)`. When one period
   has several prepayments, the effect of the last one applies once, on the balance after all
   of them.
   - `lowerInstalment`: the maturity is kept. The next payment is re-amortized over the
     remaining term.
   - `shortenTerm`: the instalment is kept. The effective maturity becomes payment `p` plus
     `ceil(NPER)` at the rate and instalment of payment `p`.
     - Later fixation resets re-amortize over the shortened remaining term.
     - Hand-checked example (Javorova, 500,000 Kč on 2031-01-17): term 266 payments, reset
       instalment 7,893.90, payoff on 2043-03-17. This replaces the design doc's example
       (b), which kept 8,681.46.
   - During an interest-only phase both effects are the same. The interest-only payment falls,
     and the instalment set at completion is the annuity of the lower balance.
6. **Recast detail.**
   - **Maturity form:** the effective last payment becomes the last payment due on or before
     the maturity date (DR-070 month-end rule).
   - **Instalment form:**
     - The rate is that of the next payment `q`.
     - The effective last payment is `p + ceil(NPER)`.
     - Payment `q` pays exactly the requested instalment, even when `q` is a rate reset.
     - A tranche landing on `q` re-amortizes from `q+1` over the maturity in force (ADR 0120).
     - Later resets re-amortize over that maturity.
     - An instalment that does not cover the interest of payment `q` is ignored and reported.
     - An instalment-form recast before a development loan's completion is rejected. A
       maturity-form recast is allowed there; it applies at completion.
   - **Cap:** the effective maturity is at most the later of loan start + 50 years
     (`MAX_LOAN_TERM_YEARS`) and the contract term. An instalment that would go beyond the cap
     becomes a maturity-form recast at the cap and is reported.
7. **Development tranches.** If a tranche lands on or after the effective maturity's payment,
   the maturity goes back to the contract term (ADR 0116). A recast maturity otherwise persists.
8. **Before the projection start.** Events dated on or before baseDate are history. They are
   replayed into the opening balance and are not in the projection cash flows. With no such
   event, the plain loan's closed-form opening is unchanged (parity).
9. **Over the balance or after payoff.** The engine clamps an event and reports it without
   raising, because the balance depends on assumptions and on scenario rate shocks:
   - A prepayment equal to the balance pays off the loan; later rows are zero.
   - A prepayment after payoff applies nothing and charges no fee.
   - Events after a successor block's start are dropped and reported.
   - The form shows these as warnings and never rejects a save (ADR 0116).

   Static input errors raise, as for draws (D-17):
   - an amount of zero or less, a negative fee, or an invalid date;
   - a date on or before the loan start;
   - a date on or after the loan's last possible payment;
   - a recast with both or neither of maturity and instalment;
   - a recast maturity before the next payment, beyond the cap, or (development loan) on
     or before the payment the completion lands on (ADR 0116).

10. **Refinance handover.** A prepayment dated on or before the successor's start applies to
    the old loan. The successor pays off the balance **after** it, whether or not the old
    loan's payment in the handover month is kept.
11. **Cash flow.** A prepayment and its fee are an owner cash outflow in their projection year,
    in their own columns (`prepaid`, `prepaymentFees`).
    - Net cash flow, debt service and DSCR stay operating-only.
    - Cumulative cash flow and the IRR cash flows subtract prepaid + fee, as they do for
      acquisitions.
    - The row and projection `principal` stay scheduled principal only. The KPI
      `totalPrincipalRepaid` adds prepaid, so the key invariant becomes
      Σ principal + Σ prepaid = starting debt + draws, for loans that retire within the
      horizon.
12. **Persistence.** Migration v9 adds the nullable JSON columns `mortgage_blocks.prepayments`
    and `mortgage_blocks.recasts`, each with a `json_valid` check.
    - Older backups restore with no events.
    - A form edit replaces the stored events with the form's rows (ADR 0116; before, it
      kept them, DR-129).
    - A CSV re-import keeps them too.

## Consequences

New row fields (`prepaid`, `prepaymentFee`) and projection fields (`prepaid`,
`prepaymentFees`). They join the golden master's `ADDED_FIELDS`. No parity target and no
golden hash changes, because the seed has no events.

ADR 0116 closes the gaps that #32b covered: rate-shock reach, the clamp warnings, and the
snapshot fallback (pinned under DR-118).
