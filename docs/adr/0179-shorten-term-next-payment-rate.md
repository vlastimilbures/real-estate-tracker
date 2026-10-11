# 0179. Shorten term keeps the next payment's instalment at the next payment's rate

- Status: Accepted
- Date: 2026-10-11
- Source: issues #164 and #235 (owner decisions 2026-10-11: #164 option A, #235 option B);
  owner answers to the E4b plan (2026-10-11: Q1 = A plus a warning); Track 14 PR E4b-2
- Amends: [0109](0109-loan-prepayments-and-recasts.md) §5 (the `shortenTerm` rule and its
  example), [0136](0136-shorten-term-agreed-instalment.md) (decisions 1 and 2 and the
  known limitation), [0120](0120-tranche-on-recast-payment.md) (decision 4),
  [0137](0137-agreed-instalment-pays-interest.md) (decision 3 and its example)
- Related: [0003](0003-czech-practice-decides.md) (Czech practice decides),
  [0116](0116-prepayments-ui-and-review-fixes.md) (the late window),
  [0129](0129-loan-schedule-edge-cases.md) (§1: what a late-window event sees),
  [0157](0157-accessibility-batch.md) (decision 7: loan warnings are `role="status"`)

## Context

A `shortenTerm` prepayment keeps the instalment and ends the loan after `ceil(NPER)` more
payments (ADR 0109 §5). Two parts of that rule disagreed with what the bank does.

1. **#164: the rate.** NPER used the rate of payment `p`, the payment the prepayment
   follows. The kept instalment is paid from payment `p+1` on, at `p+1`'s rate. The two
   differ at a fixation end, which is also the date a prepayment is free of charge
   (§ 117 of Act No. 257/2016 Coll.), so it is the usual date for one. Javorová prepaying
   500,000 Kč on its 2031-01-17 refix: payment 120 is the last at 1.69 %, payment 121 the
   first at the 4.5 % reset. NPER at 1.69 % gave 146 more payments; payment 121 then
   re-amortized the balance over them at 4.5 %, so the "kept" instalment rose from
   6,721.80 to 7,893.90 Kč (+17.4 %). A Czech bank sizes the new term at the rate the
   instalment will be paid at.
2. **#235: an owed re-amortization.** When payment `p+1` owes a re-amortization (after a
   maturity recast, a capped instalment recast, a `lowerInstalment` prepayment, or a tranche
   on an agreed instalment's payment), ADR 0136 decision 2 kept payment `p`'s instalment,
   which `p+1` would not pay. Only the late window reaches this for the first three, and
   the result depended on baseDate's day. The #228 comment loan (development loan from
   2023-02-07, maturity recast to 2034-02-07 dated 2025-08-07, 3,000 Kč `shortenTerm` on
   2025-09-06) ended at grid month 102 with baseDate 2025-08-07 and at month 90 with
   2025-09-06. A tranche on an agreed instalment's payment `q` reaches it in any window
   (ADR 0120 decision 4, ADR 0137 decision 3).

## Decision

The owner chose #164 option A and #235 option B on 2026-10-11, and a warning for the case
where the term cannot shorten.

1. **The kept instalment is the one payment `p+1` would pay without the prepayments**, and
   NPER runs at payment `p+1`'s rate, on the balance after the period's prepayments:
   - an agreed instalment still to pay (an instalment recast settled before the
     prepayment, after payment `p`; ADR 0136);
   - else, when payment `p+1` owes a re-amortization, the annuity of the balance before
     the prepayments (plus the late tranches the last prepayment sees, ADR 0129 §1) over
     the payments left to the maturity in force, at `p+1`'s rate;
   - else payment `p`'s instalment.

   The balance before the prepayments is the only reading of an owed re-amortization that
   shortens anything: NPER of the annuity on the balance after them is exactly the payments
   left, the `lowerInstalment` result. It is also what the forward path does, where payment
   `p+1` re-amortizes before its own prepayment.

2. **The maturity never moves later.** When the kept instalment does not repay the loan by
   the maturity in force at `p+1`'s rate (`p + ceil(NPER)` is later than it), or does not
   cover the interest (no NPER), the term stays. A rate change on `p+1` then re-amortizes
   over it, which is the `lowerInstalment` result.
3. **That case is reported**: the prepayment's outcome carries the new issue
   `PREPAYMENT_TERM_NOT_SHORTENED`, and the property page shows it with the other event
   warnings (dictionary key `propertyDetail.eventIssue.PREPAYMENT_TERM_NOT_SHORTENED`,
   en/cs/ru). Only the period's last applied prepayment, whose effect applies, carries it.
   It is not raised for an interest-only payment (both effects are the same there), for a
   prepayment that repays the loan, or for a prepayment kept on the payment a successor
   block takes over from (the owner pays nothing after it). When `p + ceil(NPER)` equals
   the maturity exactly, the kept instalment repays by it: the term stays without a
   warning.
4. **A re-amortization on `p+1` runs over the shortened term** (constant maturity,
   ADR 0003), so it pays at most the kept instalment; it pays less by the NPER round-up.
5. The same rule applies after every payment: replayed history, the late window and the
   grid. The reference model (`reference/mortgageReference.ts`) follows this wording.

The warning is a new dictionary entry under this ADR. It is the text of a `role="status"`
banner (a polite live region, ADR 0157), not an accessible name; the other event warnings
are shown the same way.

## Consequences

- **Javorová, 500,000 Kč `shortenTerm` on 2031-01-17** (reference model and engine agree):

  | Figure                          | Before (ADR 0109) | After      |
  | ------------------------------- | ----------------- | ---------- |
  | Payments after payment 120      | 146               | 183        |
  | Last payment (grid month)       | 266 (202)         | 303 (239)  |
  | Payoff date                     | 2043-03-17        | 2046-04-17 |
  | Instalment from the reset       | 7,893.8980        | 6,701.9254 |
  | Javorová debt-free year (alone) | 2043              | 2046       |
  | Portfolio levered IRR (nominal) | 0.061652          | 0.0616724  |

  NPER(4.5 %/12, 6,721.80, 886,249.89) = 182.22, so 183 payments; the instalment from the
  reset is PMT(0.375 %, 183, 886,249.89) = 6,701.93 Kč, below the kept 6,721.80 Kč by the
  round-up (decision 4). The IRR comes from the engine-free KPI model.

- **The refix edge.** With the 4.5 % reset, the kept 6,721.80 Kč repays the loan within the
  244 payments left only when the prepayment is at least ≈ 312,918 Kč, and shortens the
  term below 244 only from ≈ 315,614 Kč. Below 312,918 Kč the term stays, the result
  equals `lowerInstalment`, and the warning shows. 100,000 Kč: before, 224 more payments at
  8,497.79 Kč; now the term stays, 8,055.21 Kč from the reset, and the warning. Between
  the two amounts the term stays without a warning (decision 3).
- **#235 loan:** baseDate 2025-08-07 still ends at grid month 102 and 2025-09-06 now ends at
  month 101 (was 90). Both repay the loan with payment 131, due 2034-01-07: under 08-07
  `ceil(NPER)` rounds 100.000… up, so payment 132 clears a 0.0039 Kč residue.
- **ADR 0137 example** (tranche on `q`, 2,500,000 Kč `shortenTerm` dated 2027-01-20, 30-year
  fixation): the kept instalment is the 30,222.38 Kč annuity `q+1` owes, not the
  16,231.52 Kč `q` paid. The last payment moves from grid month 122 to 63; `q+1` pays
  29,998.11 Kč (was 16,209.51). The 10,000 Kč case still keeps the recast maturity.
- No change without a rate change on `p+1` and without an owed re-amortization: the
  off-cycle 2031-01-20 prepayment (after payment 121) still ends at grid month 186.
- Parity targets do not change: the sample portfolio has no prepayments. The golden master
  does not change: its event fixtures have no rate change on the payment after a
  `shortenTerm` and no owed re-amortization there, and no warning.
- `PaymentDone.ratePa` lost its only reader and is removed (internal).
- Tests: the pins above (`loan-events`, `effective-maturity`, `loan-events-kpis`,
  `reference/loanEvents.reference`, `loan-event-invariants`, `recast-tranche`); new engine =
  reference cases (a small and an uncovered refix prepayment, the shock revert on `p+1`, a
  late prepayment before the first reset payment, and the three #235 late-window cases);
  a KPI-model case for the 500,000 Kč prepayment; the warning in the engine, at a handover
  (`chain-changes`) and in every language (`loanWarnings`).
