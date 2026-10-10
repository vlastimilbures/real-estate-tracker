# 0166. Development loans: completed value and committed debt during construction

- Status: Accepted
- Date: 2026-10-09
- Source: issue #120 (2026-10 code review, finding R8-02); owner decision D3 = B
  (2026-10-09); Track 11 PR 11.18
- Amends: [0165](0165-future-purchases.md) (decision 1: a development flat comes in at its
  completed value; there is no ramp in the turn-on year), [0119](0119-acquisition-funding.md)
  (decision 5: the later tranches of a first loan that is not the acquisition loan are
  committed debt; and a development loan on a flat owned at baseDate is no cash in),
  [0134](0134-acquisition-cash-gaps.md) (a first loan drawn after baseDate on a flat owned at
  baseDate is cash in only when it is a plain loan)
- Amended by: [0169](0169-development-drawn-debt-display.md) (decision 5: the screens show
  the drawn debt and the value less the undrawn tranches),
  [0168](0168-development-loan-is-the-acquisition-loan.md) (decision 7 applies
  to plain loans only: a future buy's first development loan is its acquisition loan)
- Related: [0024](0024-draw-timing.md) (draw timing),
  [0003](0003-czech-practice-decides.md), [0039](0039-golden-master.md),
  [0001](0001-behaviour-change-gate.md), [0126](0126-degenerate-kpis.md) (no
  growth base when equity₀ ≤ 0)

## Context

A development (off-plan) flat is entered with its completed value and a development loan:
an initial draw plus tranches the bank pays to the developer as construction goes on. Until
now the engine scaled the completed value by the share of the loan drawn so far
(`drawnFraction`, SPEC §4.3). Own funds paid to the developer did not count. During
construction equity was therefore `f × (V − L)`: `f` the drawn share, `V` the completed
value, `L` the whole loan.

Each koruna the bank drew added `(V − L) ÷ L` korun of equity, with no owner cash. The
return KPIs (net-worth multiple, CAGR, levered IRR) take equity at the projection start as
the amount invested. When the projection started during construction, that equity was too
low and the later draws showed up as return. The review's probe (#120): the mixed fixture's
dev flat alone gave a 13.87x multiple and 8.75 % levered IRR. The same flat with the same
4.5 M Kč loan already drawn gave 6.14x and 6.10 %.

The ramp was right for LTV: total loan ÷ completed value, the ratio the bank approved and
monitors. It was not designed for the return KPIs.

## Options

- A: ramp by the price paid so far (own cash from the ADR 0119 record + bank drawn) and book
  later own-fund payments as owner outflows. The record has no payment dates, so own cash
  would be assumed paid at the start.
- **B: committed debt (chosen).** Value = completed value. Debt counts the whole scheduled
  loan: the drawn balance plus the tranches not drawn yet. Interest and payments stay on the
  drawn balance.
- C: keep the ramp for value and LTV; compute only the return KPIs from completed-value
  equity. The equity chart and the multiple's base would then disagree.
- E: footnote only. The numbers would stay overstated.
- F: leave as is.

## Decision

1. **Value is the completed value.** A development property's value is its valuation grown
   like any other property, from year 0 and in every snapshot. The construction ramp and
   `drawnFraction` are removed.
2. **Debt counts the undrawn tranches as committed.** `ProjectionYear.committedDebt`,
   `PropertySnapshot.committedDebt` and `PortfolioSnapshot.totalCommittedDebt` = the drawn
   balance + the development loan's principal not drawn yet: its initial principal while the
   loan has not started, plus its tranches still ahead. It follows the schedule's grid
   (`undrawnPrincipal`): an amount counts as drawn from the first grid month on or after its
   date, and one dated on or before baseDate is opening debt (D-44). So `committedDebt −
balance` is exactly what the schedule will still draw, and the snapshot and the projection
   agree at every grid date.
   - A tranche past the last grid month it may land in joins that month, as in the
     schedule (ADR 0139).
   - Before its own draw month, a property's first loan counts (decisions 7 and 8 give the
     exception: a future buy's later first loan). A development loan that follows another
     block counts from its own draw month (before that, the predecessor's debt is owed).
     Its successor's draw month ends it. A tranche dated after the successor's start is
     never drawn and is not committed.
   - A property not owned yet commits only the debt it already owes (ADR 0165 decision 4).
   - A plain loan commits nothing beyond its balance.
3. **Equity and LTV use committed debt.** `equity = value − committedDebt` and LTV =
   `committedDebt ÷ value`, per property and for the portfolio, in the projection and the
   snapshot. During construction LTV is total loan ÷ completed value, as the ramp gave. A
   tranche draw moves debt from undrawn to drawn, so it no longer changes equity. The return
   KPIs start from `V − L`.
4. **Payments do not change.** The amortization schedule, `balance`/`debt`, interest,
   principal, debt service, DSCR, net cash flow, cash to owner, the weighted average rate
   (weighted by drawn debt) and the debt-free year (drawn balance) are unchanged.
5. **The UI shows committed debt.** Every debt figure that sits beside equity or LTV shows
   `committedDebt`: the Dashboard total debt tile, the Property detail debt tile, the
   Properties debt column, the Projection grid and its export, and the balance line of the
   charts. The Projection grid's Draws column becomes "New debt" (cs "Nový dluh", ru "Новый
   долг") and shows `committedDraws`, so the Debt column reconciles year to year. The Guide's
   Debt formula reads "outstanding balance + development tranches not drawn yet". When part of it is not drawn yet, the two tiles add a sub-line: "incl. {amount}
   not drawn yet" (cs "z toho {amount} dosud nečerpáno", ru "в т.ч. {amount} ещё не
   выбрано"). The equity-change chart's new-debt stack becomes the new committed debt:
   `ProjectionYear.committedDraws` = draws − the decrease of the undrawn part, a nominal
   flow the real lens deflates by one year factor (so no inflation residual shows as a
   bar). A tranche draw shows no bar, the undrawn part of a loan that comes in shows in its
   year, and the stacks still sum to the equity change.
6. **ADR 0165 decision 1:** a development flat bought after baseDate comes in at its
   completed value at the purchase date (`acquiredValue`), with its whole loan committed.
7. **ADR 0119 decision 5:** a future buy's first loan that is not its acquisition loan
   still pays its initial principal to the owner as cash in. It is committed debt only from
   its own draw month; its later tranches are not cash, and are committed from then on, with
   no value offset.
8. **ADR 0134, development loans (owner, 2026-10-09, in the PR review):** on a flat owned
   at baseDate, a first development loan drawn after baseDate pays the developer, not the
   owner. It brings no cash in, and its whole amount is committed debt from baseDate, so it
   reads like the same loan drawn before baseDate. A first plain loan drawn after baseDate
   keeps ADR 0134 (cash in, debt from its draw). Before this, the loan was both netted from
   equity₀ and paid in as cash: moving its start three months later raised the IRR by about
   1.7 points.

## Consequences

- The probe's dev flat returns 5.0 M Kč equity at baseDate (was 2.22 M) and a multiple and
  IRR within 2 % and 10 bp of the completed flat (`dev-committed-debt.test.ts`).
- Own funds not yet paid to the developer count as already invested: the record has no
  payment dates. Recorded in `docs/model-limitations.md`.
- **Golden master moves** for the development cases only: the mixed fixture's projection,
  its KPIs (multiple, CAGR, IRR; cumulative cash flow does not move) and its scenario and
  horizon runs, the dev edge loans inside a portfolio, and the edge-loan `drawn` fraction
  pin, now `undrawn` principal. The seed runs do not move. The snapshot is updated in the
  same commit as this ADR (ADR 0039). The new fields join the golden `ADDED_FIELDS`. The #117
  pin in `cash-outside-net-cf.test.ts` moves with the mixed IRR. Decision 8 (a review fix,
  updated in its own commit) also moves the `devFuture` edge loan inside a portfolio: its
  3 M Kč cash in is gone, so its cumulative cash flow and IRR fall. The ADR 0134 pin in
  `acquisition-cash.test.ts` for a development loan now expects no cash in.
- **Parity targets do not change**: the sample portfolio has no development loan, so no row
  is added to the target change log.
- Tests: `dev-committed-debt.test.ts` (replaces `dev-value-ramp.test.ts`), the committed-debt
  snapshot = projection invariant in `invariants.test.ts`, `pending-debt-totals.test.ts`, a
  check that the undrawn principal equals the schedule's later draws (the ADR 0139 cap
  included), and the UI cases for the tiles and the equity-change chart.
