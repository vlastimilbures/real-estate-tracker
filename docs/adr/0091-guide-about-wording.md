# 0091. Guide and About wording matches the model

- Status: Accepted
- Date: 2026-10-03
- Source: issue #16 (pre-release review 2026-10, findings A15 and D08, in-app part)

## Context

The in-app Guide and the About screen describe some figures in ways that overstate or
contradict SPEC:

1. The net-worth multiple divides by "equity today". SPEC §4.6 divides by equity₀, the equity
   at the projection start (base date).
2. Levered IRR is "the return on the money you put in", including "the sale at the end". The
   IRR vector starts with −equity₀ (an opportunity-cost basis, not purchase cash) and ends
   with projected equity at the horizon, with no selling costs or tax (SPEC §4.6).
3. The principal check says Σ principal repaid "must exactly equal the starting debt". That
   holds only when every loan is repaid within the horizon, and then it equals the starting
   debt plus later draws (SPEC §4.5).
4. Net cash flow is "what actually lands in your pocket". It is a modelled annualised flow,
   not a cash ledger (SPEC §§4.3, 10).
5. Projected rent "× (1 + indexation) / yr" ignores leases. Rent follows leases month by
   month: gaps earn nothing, the last lease is treated as renewed, and each lease is indexed
   from its start (SPEC §4.5, ADR 0080).
6. About says figures "reconcile to the cent" (cs "na korunu", ru "до кроны"). The tested
   tolerance is ±1 Kč (CLAUDE.md §6), and the three languages disagree.
7. Nothing says that deactivating a property does not record a sale.

## Decision

1. Multiple: "equity at horizon ÷ equity at projection start".
2. IRR: the annual return from the projection start, treating that day's equity as the amount
   invested, plus yearly cash flows and the projected equity at the horizon (no selling costs
   or tax). The example no longer mentions a sale.
3. Principal check: "When every loan is repaid within the horizon, total principal repaid
   equals the starting debt plus any later draws."
4. Net cash flow: "Modelled yearly cash flow after costs and mortgage — an estimate, not a
   bank-account record."
5. Rent: lease by lease, indexed; gaps earn nothing, the last lease is treated as renewed,
   each lease is indexed from its start.
6. Guide definitions can carry a short "what this does not mean" caveat, shown under the
   meaning. IRR: "Not the return on your original purchase cash." Net cash flow: "Not actual
   receipts."
7. The Guide snapshot prose and the deactivate confirmation say that deactivating does not
   record a sale, sale proceeds or a loan payoff.
8. About: "Money is computed with exact decimal arithmetic (never floating point). Results are
   tested against reference figures within ±1 Kč." Same meaning in cs and ru.
9. The link to the model-limitations document waits for that document (#28).

## Consequences

Copy and one presentational field only; no computed number, parity target or engine output
changes.
