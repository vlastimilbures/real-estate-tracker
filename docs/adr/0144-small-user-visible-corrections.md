# 0144. "End previous" only for open-ended records; the interest-saved label names its window

- Status: Accepted
- Date: 2026-10-07
- Source: issue #121 part 1 (G1-4-02), issue #172 item 3, issue #32 leftovers; Track 10 PR 10.5
- Related: [0099](0099-close-previous-open-record.md) (corrected here),
  [0130](0130-interest-saved-refinance.md) (interest saved), [0109](0109-loan-prepayments-and-recasts.md)
  (prepayments and recasts)

## Context

Three small user-visible corrections.

- **ADR 0099's promise does not hold for a dated new record.** ADR 0099 offers to end the
  previous open-ended valuation or lease when a new one is added, and says that no computed
  number changes. For a lease that is true only when the new lease is open-ended. When the new
  lease has its own end date, the previous open lease comes back into force after that date,
  and ending it removes that rent (#121, G1-4-02). The dialog was still offered, with "End
  previous record" as the primary button. Valuations no longer change numbers this way: since
  [ADR 0122](0122-valuation-persists-past-valid-to.md) a valuation's end date is not read, so
  the issue's "falls back to the purchase price" no longer happens. A closed previous
  valuation still writes an end date the user did not type, next to a dated record that
  ends earlier.
- **The Dashboard's "Interest saved by prepayments (nominal)" does not say over which
  period.** It sits next to "Total interest (Yrs 1–N)", but it covers the loans' remaining life:
  grid month 1 to payoff (`prepaymentInterestSaved`, `src/engine/financing.ts`). A reader takes
  it for the same N years (#172 item 3; ADR 0130 left it open).
- **Two doc leftovers of #32.** `docs/csv-import.md` does not say that prepayments and recasts
  cannot be imported; only ADR 0109 says so. The CLAUDE.md §7 correctness invariant names only
  principal repaid, while the tests pin scheduled plus prepaid principal.

## Decision

1. **The "end previous" dialog is offered only for an open-ended new record.** When the new
   valuation has a "Valid to" date or the new lease has an end date, the record is added with
   no dialog and the previous record is left as it is. This replaces ADR 0099 Decision 3
   ("no prompt … when the new record ends before that record starts"), and makes its
   Consequences ("no computed number changes") hold for leases. Valuations follow the same
   rule, so both panels behave alike (owner decision D3 = A, 2026-10-06). ADR 0099 is
   otherwise unchanged; the store's checked atomic write is untouched.
2. **The label names its window.** `dashboard.financingInterestSaved` reads "Interest saved
   by prepayments over the loans' remaining life (nominal)", with the same meaning in cs and
   ru. The figure is unchanged.
3. **Docs.** `docs/csv-import.md` notes that prepayments and recasts cannot be imported and are
   entered in the mortgage form. CLAUDE.md §7 states the invariant as scheduled plus prepaid
   principal (owner's OK, 2026-10-06).

## Consequences

- A dated new valuation or lease no longer asks; to close the previous record the user edits
  its end date by hand, as before ADR 0099. Open-ended additions keep the dialog.
- One label changes in en, cs and ru. No computed number, parity target or golden-master
  change. The overlapping-lease rule (#121 part 2) is engine work and stays open.
