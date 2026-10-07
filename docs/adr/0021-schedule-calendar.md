# 0021. Schedule calendar: base-date grid, loan due dates

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-21, J-03
- Amended by: [0129](0129-loan-schedule-edge-cases.md) (interest-only is read on the due date too), [0130](0130-interest-saved-refinance.md) (D-47: the handover row)

## Context

The schedule ran on a base-date month grid; the fixation reset landed in the wrong month relative to the loan's own due dates (J-03).

Options considered for J-03 (Schedule calendar): (a) base-date months on a 30/360 basis, as today; (b) a payment-day calendar per loan. Recommendation at planning: (a) plus documentation, unless Q-03 shows a material error. P02 recommendation: see P02-mortgage-audit.md §7

## Decision

**Schedule calendar (answers J-03):** option (a′) — keep the baseDate month grid, but key the interest rate and the elapsed-payment count on each loan's due dates `EDATE(start, k)`: the payment due on the fixation-end date is at the fixed rate; the reset applies from the next payment. Also fixes month-end payment counting (DR-070). **Changes parity targets (ADR 0003).**

Related follow-up decisions:

- **D-40**: **Payment at maturity clears the balance (answers the P4b D-21 gate, DR-104):** the payment whose number equals the loan's term (derived or explicit) pays the whole outstanding balance, as the P02 reference model does. The post-payoff "dust" row disappears; a loan whose instalment cannot retire it by its term pays the residual as a final balloon payment instead of carrying debt past maturity.
- **D-45**: **Value-growth month count (answers DR-123):** count whole months of value growth with the D-21 month-end rule (`lastGridMonthOnOrBefore`) on both the snapshot and the projection, so a 29 Feb baseDate (clamped to 28 Feb) still counts a full year.
- **D-47**: **Refinance handover (completes D-27/D-43, DR-030):** a successor draws in the first grid month on/after its start. (1) Predecessor payments due on or before the successor's start are still paid; one that falls in the draw month is carried by the draw row (its interest, principal and instalment), which ends at the successor's principal. Payments due after the start are dropped. (2) Net refinance cash = successor principal − predecessor balance paid off, counted in the handover year in cumulative net cash flow and levered IRR (like the acquisition outflow); projection rows are unchanged.

## Consequences

P4b fixes DR-101 and DR-070 with failing tests first, then re-baselines the parity targets and adds the target change log rows in the same change.
