# 0177. Removing an unused engine output field: proof that no number moved

- Status: Accepted
- Date: 2026-10-11
- Source: issue #145 (code review 2026-10, R2-20); owner decision (2026-10-11, Track 14 E4a:
  Q1 option C, remove only `PropertySnapshot.weightedRateNumerator`); Track 14 PR E4a-2
- Amends: [0174](0174-golden-master-loan-events-regression-layers.md) (decisions 1 and 3: a
  field may also be removed, and the v1 cases are then re-recorded under a proof rule)
- Related: [0039](0039-golden-master.md) (golden master), [0001](0001-behaviour-change-gate.md)
  (behaviour-change gate), [0165](0165-future-purchases.md) (the weighted rate counts a pending
  property's drawn debt)

## Context

1. **An output field nothing reads.** `PropertySnapshot.weightedRateNumerator` (balance × rate)
   exists only so `portfolioSnapshot` can sum it into `weightedAvgRate`. No UI, state, export
   or report code reads it; two tests did. It is a Real-lens trap too: `realPropertySnapshot`
   copies it undeflated beside deflated money fields.
2. **ADR 0174 has no rule for a removal.** It freezes the v1 golden cases byte-for-byte and
   says a new field shows in v2 as added lines only. v1 hashes whole objects minus
   `ADDED_FIELDS`, so deleting any hashed field moves every v1 hash that contains it, even
   when no number moves. 0174 gives no way to tell that apart from a real change.

## Decision

1. **The portfolio weights the rate itself.** The internal `snapshotProperty` returns the
   snapshot and the rate in force at `asOf` (0 without debt); `propertySnapshot` returns the
   snapshot. `portfolioSnapshot` sums `debt × rate` over the active rows, in portfolio order,
   starting from 0 — the same operations in the same order as before, so `weightedAvgRate` is
   bit-identical. No new public field. `weightedRateNumerator` is removed from
   `PropertySnapshot`.
2. **An unread output field may be removed without a behaviour-change ADR (ADR 0001),** but
   under an ADR that names it, with the golden master re-recorded in the same commit, when
   this proof holds:
   - copy the current snapshot; temporarily add the field to `ADDED_FIELDS` and re-record
     (`stripped.snap`); restore both files;
   - remove the field and re-record;
   - `diff stripped.snap new.snap` shows only the deleted v2 lines of that field, nothing else.
     No v1 line in that diff means the old v1 hashes with the key filtered out equal the
     new v1 hashes; no v2 line but the field's own means no other v2 value changed.
     The proof output goes into the ADR and the PR body. Any other line in the diff means a
     number moved: stop and treat it as a behaviour change.
3. **`ProjectionYear.ratePa` stays.** SPEC.md lists it; its comment was corrected in E4a-1.
   Removing it would need its own proof (the name is also an amortization-row key) and a SPEC
   edit.

## Consequences

- Proof for this PR (base `origin/main` 6fee10f7):

  ```
  $ diff base.snap stripped.snap | grep -c '^<'           # v1 lines that move when the key is filtered
  147
  $ diff stripped.snap new.snap > proof.diff; echo $?
  1
  $ grep -c '^<' proof.diff; grep -c '^>' proof.diff
  36
  0
  $ grep '^<' proof.diff | grep -c '"perProperty\[\].weightedRateNumerator"'
  36
  $ grep -cE '^[0-9]+(,[0-9]+)?[ac]' proof.diff           # hunks that add or change lines
  0
  ```

  The re-recorded snapshot therefore changes 147 v1 lines (each equal to the key-filtered
  hash) and deletes 36 v2 `perProperty[].weightedRateNumerator` lines (4 v2 cases × 9
  sections that hold a property snapshot). The 36 v2 `weightedAvgRate` lines are unchanged.

- `PropertySnapshot` loses one field; the engine's public API is otherwise unchanged. No
  computed number changes: the golden-master fixtures show it, and the weighting runs the
  same Decimal operations in the same order. No parity target, tolerance, stored data,
  export or UI changes.
- A later removal follows decision 2; an addition still follows ADR 0174 decision 3.
