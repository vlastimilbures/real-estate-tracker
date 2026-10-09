# Model assumptions & limitations

What the numbers in the app mean, and what they leave out. The app is a planning tool: it
projects a portfolio from the records you enter and a few assumptions. Read this before you
use the results for a real financial decision. The formulas are in [SPEC.md](../SPEC.md);
work still to do is in the [roadmap](roadmap.md).

## Planning estimates, not quotes

- **Estimates.** Every figure is a projection from your records and assumptions (growth,
  rent indexation, inflation, vacancy, costs). It is not a lender quote, a valuation or a
  guaranteed outcome.
- **Your inputs decide the result.** A missing lease, valuation or mortgage block changes the
  numbers, often without a warning.
- **Tested arithmetic, not tested assumptions.** Money is computed in exact decimals and checked
  against reference figures within ±1 Kč. That proves the formulas run as specified; it does
  not make the assumptions right.
- **Assumption bounds catch typos, not implausible values.** Interest rates, the reset rate
  included, must lie within 0–100 %, and growth, rent indexation and inflation above −100 %,
  also with a scenario's shock added (ADR 0128). Anything inside those bounds is computed as
  entered: a 40 % growth rate for 50 years gives large but valid numbers.

## Returns start at the projection start

- **The investment is your equity at the projection start.** The net-worth multiple, CAGR and
  levered IRR treat the equity on the projection start date (value − debt) as the amount
  invested. They are not returns on the cash you paid at purchase, and the app has no
  since-purchase performance. The recorded own cash is shown as "Cash invested", but no
  return is measured from it. See [SPEC §4.6](../SPEC.md#46-portfolio-kpis).
- **What enters the IRR.** The yearly net cash flows, the down payment for a property bought
  after the projection start, and the net cash from a refinance. The down payment is the own
  cash recorded for the purchase (the property form's Acquisition section); without it, the
  purchase price minus the loan that funded it, plus any recorded costs and works
  (ADR 0119). The loan that funded the purchase is the property's first loan, if it starts
  no later than 90 days after the purchase. A later first loan counts as cash paid to you in
  the year it is drawn, and so does a first loan taken out after the projection start on a
  property you already own (ADR 0134); a development loan's tranches do not. A loan that
  starts before a future purchase date (an off-plan loan drawn at contract) is paid by you
  before the handover: its instalments, prepayments and fees in the projection years before
  the purchase count as cash you paid, although those years show no rows for the property
  (ADR 0124). The principal it repaid before the projection start is charged with the down
  payment, in the purchase year rather than when it was paid, so the IRR reads a little
  high. When the loan was already refinanced before the projection start, neither the
  principal repaid nor the cash from that refinance is traced, so the cash you paid can
  read too high or too low (ADR 0134). A property bought after the horizon pays its
  instalments inside the horizon but never adds its value. With equity of zero or less
  at the start, the multiple and CAGR show "—", and so does CAGR when net worth at the
  horizon is zero or less; when the cash flows give no single answer, IRR shows "n/a"
  with the reason.
- **The end value is projected equity.** At the horizon the model counts each property's
  projected value minus its remaining debt. It does not sell anything: there are no selling
  costs, agent fees or taxes on a sale.

## Cash flow and tax

- **No cash ledger.** Net cash flow is a modelled yearly figure (rent after vacancy, minus
  costs and mortgage payments). It is not a record of your bank account and is not
  reconciled with one. See [SPEC §10](../SPEC.md#10-out-of-scope--future).
- **Property tax only.** The property tax (daň z nemovitých věcí) is a holding cost. Income tax
  and capital-gains tax are not modelled, so all figures are before those taxes. (The Czech
  property acquisition tax was abolished in 2020.)

## Mortgages

- **One active block per property.** A mortgage is a chain of blocks. A new block replaces the
  previous one on its start date (a refinance or a new fixation). The app has no concurrent
  loans on one property. See
  [SPEC §4.2](../SPEC.md#42-derived-per-mortgage-block-values).
- **Refix at fixation end.** When a fixation ends, the model switches to the block's reset rate
  and recalculates the instalment over the remaining term. Once you know the real new terms,
  enter them as a new block. If a fixation has already ended and there is no new block, or
  the next block leaves at least one payment at the reset rate, the app warns you
  (ADR 0129). A new block's principal less the balance it pays off shows as the
  "Refinance difference", not as a draw, even when the previous loan was already repaid
  and the new block pays off nothing (ADR 0130).
- **Floating-rate loans (0 years of fixation).** The model assumes every payment due up to
  today was at the rate you entered, and every later payment is at the reset rate, with
  the instalment recalculated over the remaining term. If the rate changed in the past,
  today's balance is an approximation; enter each past rate period as its own block for the
  exact history. There is no "fixation ended" warning for such a loan (ADR 0162).
- **One development loan per property.** You can enter more than one, but the property's value
  during construction follows only the first. One development loan per property, optionally
  refinanced into a plain loan, is the supported case.
- **Simplified interest.** Interest is computed once a month as balance × rate ÷ 12 (a
  30/360-style simplification). The loan's payment day and interest for a first partial month
  are not modelled, so totals can differ slightly from a bank statement. See
  [SPEC §4.4](../SPEC.md#44-monthly-amortization-the-engine-within-the-engine).
- **Prepayments and maturity changes are simplified.** A one-off prepayment is applied right
  after the next payment due on or after its date, so a prepayment between two due dates is
  charged up to a month of interest it would save at the bank. The fee is what you enter:
  the app does not work out the legal fee or the annual penalty-free allowance. A
  prepayment larger than the balance, or after the loan is repaid, is cut to what is owed,
  and the property page warns about it. Interest saved is nominal, uses the base-case
  assumptions, covers the loan's whole remaining life and is not net of fees (ADR 0116).
  It is shown only when a prepayment repaid some principal. When a maturity change takes
  effect only because of the prepayment (a lower instalment that the higher balance without
  it could not carry), the comparison measures that change too and can come out negative:
  the app then shows "n/a" instead of a figure (ADR 0130). A prepayment on the day a new
  block starts saves nothing in the model, because the new block's principal is what you
  enter, so no figure is shown for it.
  Prepayments and maturity changes entered on a loan block that a later block had already
  replaced before the projection start have no effect, and no warning says so.
  A development-loan tranche counts in full for every prepayment and maturity change
  settled after the same payment, even one dated before the tranche. The exception is the
  window between the last payment due and the projection start: there an event counts only
  the tranches dated on or before it, and never a tranche dated after the projection start
  (ADR 0129).
  See [SPEC §4.4](../SPEC.md#44-monthly-amortization-the-engine-within-the-engine) and
  ADR 0109.
- **The maturity check uses the contract term.** The implied-maturity warning compares the
  term or instalment you entered with the contract maturity date. It ignores prepayments
  and maturity changes, which move the maturity on purpose (ADR 0116).
- **Balloon at maturity.** If the instalment cannot clear the loan by the end of its term, the
  last payment pays the rest.

## Rent and leases

- **Rent follows your leases.** Months before the first lease and gaps between leases earn
  nothing. The vacancy allowance applies on top. See
  [SPEC §4.5](../SPEC.md#45-annual-projection-year-0--horizon).
- **The last lease is treated as renewed** in the projection, indexed every year, unless it
  ended before the projection start.
- **The snapshot does not renew it.** The Dashboard for today, or for a date close to the
  projection start, shows the rent of the lease in force on that date, without indexation,
  and no rent after the last lease ends.
- **The Data check flags a lease end only when no later lease is entered** (ADR 0118). A gap
  between two entered leases is not flagged until a date inside the gap, when the check shows
  no lease in force.

## Dates: snapshot vs projection

- **Dates near the projection start** (less than six months after it) show the records in
  force on that date. See [SPEC §4.3](../SPEC.md#43-snapshot-the-as-of-lens).
- **Later dates show the nearest projection year**, so a date 30 months after the start shows
  year 3. The label under the date says which year is shown.
- **Dates past the last projection year** show the records in force on that date, not a
  projection.
- **Dates before the projection start** cannot be chosen. Move the projection start in
  Settings → Assumptions to look at an earlier date.

## Real terms

- **Real = Kč at the projection start.** Real figures divide each amount by the cumulative
  inflation index (your CPI assumption, including any inflation shock in a scenario). They
  show purchasing power in projection-start money.
- **Ratios do not change.** LTV and DSCR are the same in nominal and real terms.

## Properties

- **Deactivating is not selling.** A deactivated property is left out of the Dashboard,
  projections and KPIs. The app does not record a sale, sale proceeds or a loan payoff, and
  the property's equity simply disappears from the totals.
- **No value, no ratio.** When a value is 0 (a 100 % crash in a scenario, or a 0 Kč
  valuation), LTV and the yields show "n/a": there is nothing to divide by. With no debt
  either, LTV shows 0 %.

## Currency and local practice

- **Czech koruna only.** All amounts are in Kč with Czech number and date formatting
  ([ADR 0058](adr/0058-remove-currency-tab.md)).
- **Czech mortgage practice.** Annuity mortgages with fixation periods and a rate reset at
  refix. Where a formula is in doubt, Czech banking practice decides
  ([ADR 0003](adr/0003-czech-practice-decides.md)).
