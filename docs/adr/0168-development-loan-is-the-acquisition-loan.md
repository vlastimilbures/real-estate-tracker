# 0168. A development loan is the acquisition loan, whatever its start

- Status: Accepted
- Date: 2026-10-09
- Source: owner report (2026-10-09). An off-plan flat whose development loan starts 123
  days after the purchase date shows the whole loan as a funding gap. The equity chart
  shows value and equity before the debt. Owner decision: the plan was approved on
  2026-10-09.
- Amends: [0119](0119-acquisition-funding.md) (decision 3: the 90-day window; decision 5:
  a later first loan pays its initial principal to the owner),
  [0166](0166-development-committed-debt.md) (decision 7)
- Related: [0003](0003-czech-practice-decides.md), [0039](0039-golden-master.md),
  [0001](0001-behaviour-change-gate.md)

## Context

ADR 0119 §3 defines the acquisition loan as the property's earliest block when it starts
no later than 90 days after the purchase date. A later first loan is treated as money paid
to the owner, for example a loan that refinances own funds (ADR 0119 §5). For a future buy,
ADR 0166 §7 kept that rule for a development loan:

- the loan counts as committed debt only from its own draw month;
- its initial principal is booked as cash in to the owner.

In Czech off-plan practice, the buyer signs the purchase (or future purchase) contract and
pays the own funds to the developer first. The loan contract often follows months later.
The bank then pays each tranche straight to the developer, against construction
milestones. A development loan therefore never reaches the owner as cash. It funds the
purchase, whenever it starts.

The window gave three wrong results for such a flat:

1. The Acquisition check left the loan out of the sources. The whole loan showed as a
   gap ("The recorded sources fall … short of the uses").
2. The flat came in at its completed value in its purchase year, with no debt until the
   loan's draw month. The "Value vs debt vs equity" chart showed equity of about the whole
   value, paid for by the own funds alone.
3. The initial principal was booked as cash in to the owner, which raised the cash to the
   owner and the levered IRR.

The same flat owned at baseDate already behaves correctly (ADR 0166 §8): the first
development loan pays the developer, brings no cash in, and counts as committed debt from
baseDate. The result therefore depended only on whether baseDate fell before or after the
purchase.

## Options

- **A: a first development loan always funds the purchase (chosen).** A plain loan keeps
  the 90-day window.
- B: widen the window. This is arbitrary. It would misread a later plain loan that
  releases equity.
- C: no code change. The owner moves the purchase date to within 90 days of the loan.
  This misdates the own-funds outflow and the value, and it keeps the inconsistency.

## Decision

1. **The acquisition loan.** A property's earliest block funds the purchase when it is a
   development loan (`isDevLoan`: it has tranches or a completion date), whatever its start.
   It also funds the purchase when it starts no later than 90 days after the purchase date
   (ADR 0119 §3, unchanged for plain loans). `fundedThePurchase` carries the rule. Every
   reader follows it: the Acquisition check (sources and uses, the down payment of a future
   buy), the committed debt (`undrawnPrincipal`), and the cash in of a later first loan
   (`laterFirstLoan`).
2. **ADR 0166 §7 now applies to plain loans only.** A future buy's first development loan
   is never cash in. It is committed debt from the turn-on year, with its tranches still
   ahead, as for any acquisition loan. ADR 0119 §5's cash in of a later first loan applies
   to plain loans only.
3. **The wording follows.** These two dictionary entries say a development loan always
   counts:
   - `propertyDetail.acqNote`;
   - `guide.returnsDefs.sourcesUses.meaning`.

## Consequences

- An off-plan flat whose loan starts more than 90 days after the purchase:
  - the Acquisition check counts the whole loan (initial principal and every tranche);
  - the equity chart shows debt from the purchase year;
  - no part of the loan is booked as cash in.
- Edge case accepted: a cash purchase followed months later by a renovation loan paid in
  tranches now counts that loan as the acquisition loan. At worst the Acquisition check
  shows "sources exceed the uses", a warning and never a blocker. On a future buy that
  loan is also netted off a derived down payment, and it is committed debt from the
  turn-on year with no works value beside it. Before, its initial principal was cash in.
  The start date has no upper limit: a development loan starting after the horizon is
  still netted and committed. Recorded in `docs/model-limitations.md`.
- **Parity targets do not change**: the sample portfolio has no development loan, so no
  row is added to the target change log. No golden-master case has a future buy with a
  development loan starting after the window, so the snapshot does not move.
- Tests:
  - the ADR 0168 cases in `acquisition-funding.test.ts`, which replace the old "only its
    initial principal comes back" pin;
  - the late development loan case in `dev-committed-debt.test.ts`.
