# 0163. Leases of one apartment never overlap

- Status: Proposed
- Date: 2026-10-09
- Source: issue #121 part 2 (2026-10 code review); owner decision D8 (2026-10-09: "leases
  cannot overlap on a single apartment"); Track 11 PR 11.15
- Amends: [0099](0099-close-previous-open-record.md) (the lease half: adding a lease ends
  the open predecessor without asking), [0144](0144-small-user-visible-corrections.md)
  (decision 1 for leases; the overlap rule it left open is decided here),
  [0118](0118-data-check.md) (a new "Needs attention" finding)
- Related: [0080](0080-close-out.md) (lease steps in the projection, unchanged)

## Context

Two leases of one property could both be in force on the same day: the owner kept the
previous open lease ("Keep as is", ADR 0099), added a dated lease after an open one (ADR
0144 adds it with no dialog), or imported a `rents.csv` row with a new `start_date`. The two
halves of the app then read the overlap differently (#121 part 2):

- The **snapshot** takes the lease in force with the latest start (`leaseInForce`,
  `src/engine/metrics.ts`). After a dated later lease ends, the earlier open lease is in
  force again.
- The **projection** treats the latest-start lease as renewed (`renewedLease`,
  `buildRentPlan` in `src/engine/projections.ts`), so the earlier lease never comes back.

The Dashboard cards and the charts then disagree for the same months. An apartment has one
tenant contract at a time, so an overlap is a data error, not a case to model.

## Decision

1. **Leases of one property never overlap.** Two leases overlap when both are in force on
   some day: `a.start ≤ b.end` and `b.start ≤ a.end`, with an open end as no end. An end date
   equal to the next start overlaps (end dates are inclusive). Back-to-back leases (end on
   the day before the next start) and gaps are fine. The engine lists the pairs
   (`overlappingLeases`, `src/engine/succession.ts`) and reports `LEASE_OVERLAP` on each
   lease of a pair (`leaseOverlapErrors`, `src/engine/validate.ts`).
2. **Adding a lease ends the open lease before it.** When an open-ended lease of the same
   property starts before the new one, the store sets its end date to the day before the new
   start, in the same atomic write as the insert (ADR 0014). This holds for an open-ended and
   for a dated new lease. The lease "End previous / Keep as is" dialog is removed; the leases
   hint says what happens. Valuations keep the ADR 0099/0144 dialog unchanged.
3. **A write that would overlap is refused.** Adding or editing a lease, and a CSV import,
   fail with `LEASE_OVERLAP` on the rows they write, and nothing is written. Examples: a new
   lease that reaches into a later lease, an edit that moves an end date past the next
   start, or a `rents.csv` row that overlaps another row or a stored lease.
4. **It is a write-time rule only.** `LEASE_OVERLAP` is not part of `validatePortfolio` or
   `validateInputs`. A database or backup that already holds an overlap (from "Keep as is"
   or an earlier import) still loads and restores, and a stored pair never blocks an edit or
   import of other rows. The owner's data is never locked out.
5. **The Data check lists a stored overlap** under "Needs attention" (`leaseOverlap`), one
   row per pair with both start dates, at any as-of date (like other stored values the forms
   no longer accept). The fix link goes to the property's records.
6. **The engine projection is unchanged.** It keeps the ADR 0080 renewal rule. A legacy
   overlap is still read two ways until the owner fixes it; the Data check points to it.

## Consequences

- Adding a dated lease after an open one now ends the open lease. Before, the open lease
  came back into force after the dated one ended in the snapshot (ADR 0144). This is the
  only computed-number change, and only for data entered after this change.
- No parity target or golden-master change: the sample portfolio has no overlap (Lipova's
  leases are back-to-back).
- New strings in en, cs and ru: `inputRules.LEASE_OVERLAP`, `dataCheck.leaseOverlap`, and a
  longer `propertyDetail.leasesHint`. `closePrevLeaseTitle` and `closePrevLeaseBody` are
  removed.
- The store action `addLeaseClosingPrevious` is removed; `addLease` does it.
- `docs/csv-import.md`, `docs/model-limitations.md` and SPEC §4.3/§4.5 state the rule.
