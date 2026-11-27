# 0273. Loan prepayments and recasts: the current rule

- Status: Accepted
- Date: 2026-11-27
- Source: issue #498 (owner decision 2026-11-27: implement ADR 0272, then one current-rule
  record each for prepayments, sections and the Data check)
- Supersedes: [0109](0109-loan-prepayments-and-recasts.md),
  [0120](0120-tranche-on-recast-payment.md),
  [0136](0136-shorten-term-agreed-instalment.md),
  [0137](0137-agreed-instalment-pays-interest.md),
  [0179](0179-shorten-term-next-payment-rate.md)
- Supersedes in part: [0116](0116-prepayments-ui-and-review-fixes.md) (decisions 1 to 10,
  12, 13 and 15), [0129](0129-loan-schedule-edge-cases.md) (decision 1 and its "What stays"
  items), [0130](0130-interest-saved-refinance.md) (decisions 1 and 2),
  [0161](0161-cash-to-owner.md) (how prepayments enter cash to owner),
  [0235](0235-opening-balance-replayed.md) (the opening of a loan with past events)
- Related: [0024](0024-draw-timing.md) (tranches around baseDate),
  [0027](0027-one-active-block.md) (refinance chains), [0124](0124-pre-purchase-debt-service.md),
  [0138](0138-refinance-handover-edge-cases.md), [0160](0160-csv-import-and-stored-loan-events.md),
  [0178](0178-display-follows-rounded-value.md), [0184](0184-data-layer-write-guards.md),
  [0226](0226-refuse-late-tranche-quick-refinance.md), [0244](0244-engine-reads-lib-rules.md),
  [0247](0247-invalid-loan-start-skips-event-checks.md),
  [0272](0272-current-rule-likelihood-ui-rounds.md) (why this record exists)
- Topic: Loans: prepayments and recasts
- Trigger: the owner enters a prepayment or a change of maturity or instalment (a recast) on
  a loan block in the mortgage form
- Likelihood: plausible (the owner's real loans include a prepayment and a recast, ADR 0226)

## Context

ADR 0109 added loan prepayments and recasts. Eight later records changed its rule, and two
of those were amended again. ADR 0272 asks for one record that states the rule as it is now.
This is that record for prepayments and recasts. It changes no behaviour: every statement
below comes from an accepted record, named in brackets after it. Where the code and the
records disagree, the disagreement is listed on the pull request for the owner and not
settled here.

The superseded records keep their context, examples and measurements. Read them for why a
rule is what it is; read this record for what the rule is.

Terms used below:

- **Payment `p`**: the payment an event follows. **Payment `q`** (= `p+1`): the next payment.
- **Maturity in force**: the loan's effective last payment number, after its events.
- **Late window**: dates after the last payment due on or before baseDate, and on or before
  baseDate itself.

## Decision

### 1. What can be entered

1. A loan block carries a list of prepayments and a list of recasts. Both apply to plain and
   development loans. They never make a plain loan a development loan, and there is no
   `kind` field (ADR 0109 §1, §2).
2. **A prepayment** has a date, an amount, an effect (`lowerInstalment` or `shortenTerm`) and
   an optional fee (ADR 0109 §1).
   - The fee is the amount the owner enters. Nothing is calculated automatically
     (ADR 0109 §1).
   - The annual 25 % allowance, the payment day and partial-month interest are not modelled
     and stay on the roadmap (ADR 0109 §1).
3. **A recast** has a date and exactly one of a new maturity date or a new instalment
   (ADR 0109 §2). A full renegotiation (new rate, new lender, cash-out) is a successor block,
   not a recast (ADR 0109 §2).
4. Prepayments and recasts cannot be imported: there is no CSV column for them
   (ADR 0109 §1, ADR 0144 §3).
5. A scenario cannot add, remove or change a prepayment or recast. Scenarios change only
   Assumptions; comparing "prepay" with "keep the cash" side by side belongs with
   per-property scenario overrides (ADR 0109, Consequences).

### 2. Where an event applies

1. Every event maps to the loan's own payment number: the first payment due on or after the
   event's date. The event applies **after** that payment (ADR 0109 §3). The same rule holds
   before and after baseDate (ADR 0109 §3), with the late-window exception in 2.4.
2. Within one payment period the order is: the scheduled payment, then the prepayments in
   date order, then the recast. A re-amortization takes effect from the next payment
   (ADR 0109 §3).
3. A prepayment dated between two due dates is applied after the next due payment, so
   interest is overstated by less than one month. This stays until partial-month interest is
   modelled (ADR 0109 §3).
4. **Late window.** An event in the late window is history. It settles right after the last
   payment due on or before baseDate, so its placement depends on baseDate by less than one
   payment period (ADR 0109 §3, ADR 0116 §1). The amount it applies does not depend on
   baseDate:
   - Every balance check of a late-window event counts the late tranches dated on or before
     the event's own date: a prepayment is clamped to the balance plus those tranches; the
     `shortenTerm` answer runs on the balance after the prepayments plus the tranches dated on
     or before the last of them; a recast checks "after payoff", its instalment against the
     next interest, and its NPER on the balance plus the tranches dated on or before it
     (ADR 0129 §1).
   - The tranche still joins grid month 1 and re-amortizes there, the baseDate debt counts it
     once, and the opening balance is the balance after the last payment due, less what the
     late events took off (ADR 0129 §1, ADR 0024).
   - When a late event set new terms on a balance that already counted a late tranche, grid
     month 1 does not treat that tranche as new again: it neither restores the contract term
     (5.3) nor defers an agreed instalment (4.5). A tranche in grid month 1 that no late event
     counted keeps both rules (ADR 0129 §1).
   - An event dated before a tranche in the same ordinary period still sees that tranche
     (ADR 0129 §1, "What stays"), and a tranche dated after baseDate is new debt that no
     late-window event sees (ADR 0129 §1, "What stays").

### 3. The effect of a prepayment

1. The amount applied is `min(amount, balance)`. When one period has several prepayments,
   the effect of the last one applies once, on the balance after all of them
   (ADR 0109 §5).
2. **`lowerInstalment`** keeps the maturity in force. The next payment is re-amortized over
   the remaining term (ADR 0109 §5).
3. **`shortenTerm`** keeps an instalment and ends the loan after `ceil(NPER)` more payments.
   NPER runs at the rate of payment `p+1`, on the balance after the period's prepayments
   (ADR 0179 §1). The instalment kept is, in order (ADR 0179 §1, ADR 0136 §1):
   - an agreed instalment still to pay, from an instalment recast settled before the
     prepayment and after payment `p`;
   - else, when payment `p+1` owes a re-amortization (after a maturity recast, a capped
     instalment recast, a `lowerInstalment` prepayment or a tranche on an agreed instalment's
     payment), the annuity of the balance **before** the prepayments, plus the late tranches
     the last prepayment sees, over the payments left to the maturity in force, at `p+1`'s
     rate;
   - else payment `p`'s instalment.

   A rate change or a tranche on `p+1` is not anticipated in the instalment, only in the rate
   (ADR 0179 §1).

4. **The maturity never moves later.** When the kept instalment does not repay the loan by
   the maturity in force at `p+1`'s rate, or does not cover the interest, the term stays. A
   rate change on `p+1` then re-amortizes over it, which is the `lowerInstalment` result
   (ADR 0179 §2). When `p + ceil(NPER)` equals the maturity exactly, the term stays without a
   warning (ADR 0179 §3).
5. That case is reported as `PREPAYMENT_TERM_NOT_SHORTENED` on the period's last applied
   prepayment only. It is not raised for an interest-only payment, for a prepayment that
   repays the loan, or for a prepayment kept on the payment a successor block takes over
   from; an earlier prepayment's warning stays (ADR 0179 §3). The property page shows it with
   the other event warnings, in a `role="status"` banner (ADR 0179 §3).
6. A re-amortization on `p+1` runs over the shortened term (constant maturity), so it pays
   at most the kept instalment, less by the NPER round-up (ADR 0179 §4).
7. Later fixation resets re-amortize over the shortened remaining term (ADR 0109 §5).
8. The same rule applies after every payment: replayed history, the late window and the
   grid (ADR 0179 §5).
9. During an interest-only phase both effects are the same: the interest-only payment
   falls, and the instalment set at completion is the annuity of the lower balance
   (ADR 0109 §5).
10. The reference example is Javorová prepaying 500,000 Kč on 2031-01-17: 183 payments after
    payment 120, last payment 303, payoff 2046-04-17, instalment from the reset
    6,701.9254 Kč (ADR 0179, Consequences).

### 4. Recasts

1. From the first payment after the recast's payment `p`, the bank re-amortizes the
   balance (ADR 0109 §2).
2. **Maturity form.** The maturity in force becomes the last payment due on or before the
   new maturity date (month-end rule), and the next payment re-amortizes to it. A later
   maturity lowers the instalment, an earlier one raises it (ADR 0109 §2, §6).
3. **Instalment form** (ADR 0109 §6):
   - The rate is that of payment `q`.
   - The maturity in force becomes `p + ceil(NPER)`.
   - Payment `q` pays the agreed instalment, even when `q` is a rate reset; the recast
     maturity already reflects `q`'s rate (ADR 0109 §6, ADR 0120 §3).
   - Later resets re-amortize over that maturity.
   - An instalment that does not cover the interest of payment `q` is ignored and reported
     (`RECAST_INSTALMENT_BELOW_INTEREST`) (ADR 0109 §6, ADR 0137, Context).
   - A `lowerInstalment` prepayment settled between the recast and `q` yields to the agreed
     instalment (ADR 0120 §3).
4. **Payment `q` pays at least its interest.** It pays the agreed instalment or its
   interest, whichever is higher. When the interest is higher, `q` pays interest only:
   principal 0, and the balance after `q` is the balance before it plus the tranche
   (ADR 0137 §1). Only a tranche on `q` reaches this today; a change that lets the floor bite
   without a tranche must also add the re-amortization of `q+1` (ADR 0137 §4).
5. **A tranche landing on `q`** does not change payment `q`. Payment `q+1` re-amortizes over
   the payments left to the maturity in force: the recast maturity, or the contract term
   when 5.3 applies. The tranche's re-amortization is deferred by one payment, not dropped
   (ADR 0120 §2, ADR 0137 §2). Events settled after `q` meet that owed re-amortization
   (ADR 0120 §4):
   - a recast after `q` replaces it;
   - a `shortenTerm` prepayment after `q` keeps the annuity `q+1` owes, by 3.3 (ADR 0179 §1).
6. **The cap.** The maturity in force is at most the later of loan start + 50 years (the
   longest loan term a form accepts, ADR 0244) and the contract term. An instalment whose
   maturity would go beyond the cap becomes a maturity-form recast at the cap and is reported
   (`RECAST_TERM_CAPPED`) (ADR 0109 §6, ADR 0136 §2).
7. **Development loans.** An instalment-form recast before completion is rejected. A
   maturity-form recast is allowed there and applies at completion (ADR 0109 §6). Its
   maturity must fall after the payment the completion lands on (the first due on or after
   the completion date), or it is rejected as `INVALID_RECAST_MATURITY` (ADR 0116 §15).

### 5. The maturity in force

1. The schedule carries the loan's maturity in force. It starts at the contract term
   (ADR 0109 §4).
2. Constant-maturity re-amortization at a fixation reset, or after a rate-shock revert, uses
   the maturity in force, not the contract one (ADR 0109 §4).
3. A development tranche that lands on or after the payment of the maturity in force
   restores the contract term, so it is not repaid in one shot. A recast maturity otherwise
   persists (ADR 0109 §7, ADR 0116 §2). This rule still applies to a development loan with
   tranches but no completion date (ADR 0116 §15).

### 6. Clamps and warnings

1. The engine clamps an event and reports it without raising, because the balance depends on
   the assumptions and on scenario rate shocks (ADR 0109 §9):
   - a prepayment equal to the balance pays off the loan, and later rows are zero;
   - a prepayment above the balance is clamped and reported (`PREPAYMENT_EXCEEDS_BALANCE`)
     (ADR 0109 §9, ADR 0129, Context);
   - a prepayment after payoff applies nothing and charges no fee;
   - a recast after payoff is reported;
   - events after a successor block's start are dropped and reported.
2. A clamped, ignored or dropped event shows as a loan warning on the property page. Saving
   is never rejected for it, because a stored event can become clamped later anyway
   (ADR 0116 §10).

### 7. Input errors

Static input errors raise, as for draws (ADR 0109 §9). Each names the index of the event at
fault (ADR 0129 §5, ADR 0116 §11):

1. an amount of zero or less, a negative fee, or an invalid date;
2. a date on or before the loan start;
3. a date on or after the loan's last possible payment;
4. a recast with both or neither of maturity and instalment;
5. a recast maturity before the next payment, beyond the cap, or (development loan) on or
   before the payment the completion lands on (ADR 0109 §9, ADR 0116 §5, §15).

A loan with an invalid start date checks only the event dates themselves; the checks that
need the start are skipped, and the block reports its start (ADR 0247).

### 8. History before the projection start

1. Events dated on or before baseDate are history. They are replayed into the opening
   balance and are not in the projection cash flows (ADR 0109 §8).
2. Every running loan, plain or development, opens from a month-by-month replay of its past
   payments and events; the closed form is gone (ADR 0235 §1 and Context).

### 9. Refinance handover

1. A prepayment dated on or before the successor's start applies to the old loan. The
   successor pays off the balance after it, whether or not the old loan's payment in the
   handover month is kept (ADR 0109 §10).
2. A prepayment that the handover drops (in a payment period the successor replaces) is paid
   at the handover, out of the balance the successor pays off, and is charged its own entered
   fee (ADR 0116 §3, ADR 0109 §10). That balance includes the tranches the old loan drew in
   the handover month (ADR 0138 §1).
3. A recast in a payment period the successor replaces no longer applies and is reported,
   like an event dated after the successor's start (ADR 0109 §9, ADR 0160 §2).

### 10. Cash flow and KPIs

1. A prepayment and its fee are owner cash out in their projection year, in their own
   columns (`prepaid`, `prepaymentFees`) (ADR 0109 §11).
2. Net cash flow, debt service and DSCR stay operating-only (ADR 0109 §11).
3. Cash to owner (net cash flow minus the cash outside it) and the levered IRR subtract
   prepaid + fee, as they do for acquisitions (ADR 0109 §11, ADR 0161 §1, §2).
4. A loan that runs before a future purchase counts its prepaid principal and fees as owner
   cash out in the years before the turn-on year (ADR 0124 §2).
5. The row and projection `principal` stay scheduled principal only. The KPI
   `totalPrincipalRepaid` adds prepaid, so the key invariant is
   Σ principal + Σ prepaid = starting debt + draws, for loans that retire within the horizon
   (ADR 0109 §11, ADR 0116, Consequences).

### 11. Interest saved

1. For each property, interest saved is the interest of the chain with every prepayment
   removed, minus the interest of the chain as entered, from the first projection month to
   payoff (ADR 0116 §9). Recasts are kept on both sides; past prepayments count through the
   lower opening balance; it covers the whole remaining life of each block, is nominal, uses
   the base-case assumptions and is not net of fees (ADR 0116 §9).
2. It is null unless some prepayment of the chain repaid principal (ADR 0130 §1).
3. The engine keeps the sign. The display hides null and 0, shows a positive figure, and
   shows the note "n/a: a recast depends on the prepayment" for a negative one. The
   Dashboard total sums only the figures shown (ADR 0130 §2).
4. It is shown on the property page and in the Dashboard financing panel, never as a KPI;
   the panel shows the portfolio total and each property in a disclosure, nominal in the
   real lens too (ADR 0116 §9). Its Dashboard label names the window: the loans' remaining
   life (ADR 0144 §2).
5. A successor's own interest does not change, because its principal is an input
   (ADR 0116 §9). For a plain loan whose instalment cannot repay it by its explicit term,
   the replayed opening moves the interest saved as well, because the comparison loan
   without the prepayments is replayed too (ADR 0235 §5).

### 12. Other outputs

1. The amortization table shows Prepaid, Prepayment fee and Drawn, and the projection grid
   Prepaid, Prepayment fees and Draws, only when some row has a value that displays as
   non-zero; screen and Excel export share the rule (ADR 0116 §12, ADR 0130 §5,
   ADR 0178 §1).
2. The as-of snapshot reports the instalment in force after a month's prepayment: the next
   row's, when that row is at the same rate and draws nothing. An interest-only month, a
   reset or a tranche in the next row, or a recast alone keeps the month's own instalment
   (ADR 0116 §6). Every snapshot reads the schedule; there is no fallback without one
   (ADR 0116 §13).
3. The Scenarios rate-shock reach reads each block's last payment from the base schedule,
   after its prepayments and recasts (ADR 0116 §7).
4. The implied-maturity warning keeps comparing the entered terms with the contract
   maturity; the property page shows the modelled payoff next to it (ADR 0116 §8).

### 13. Storage and editing

1. The events are stored as nullable JSON columns `mortgage_blocks.prepayments` and
   `mortgage_blocks.recasts`, each with a `json_valid` check (migration v9). Older backups
   restore with no events (ADR 0109 §12).
2. A stored prepayment allows only `date`, `amount`, `effect` and `fee`; a stored recast only
   `date`, `maturity` and `instalment`. Any other key makes the row invalid (`ROW_INVALID`),
   and such a backup does not restore (ADR 0116 §4).
3. Saving the mortgage form replaces the stored events with the form's rows; the row editor
   itself is ADR 0116 §11 (ADR 0109 §12, ADR 0116 §11).
4. A CSV re-import keeps the stored events (ADR 0109 §12). Its preview lists stored events
   that an added block replaces, refuses a row that would make a stored event break a rule,
   and asks for confirmation (ADR 0160).

## Consequences

- ADRs 0109, 0120, 0136, 0137 and 0179 are superseded by this record. ADRs 0116, 0129, 0130,
  0161 and 0235 are superseded in the parts named in the header; their other decisions stand.
- A change to the prepayment and recast rule amends this record, not the superseded ones
  (ADR 0272 §1).
- No behaviour, parity target or golden-master value changes.
