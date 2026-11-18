# 0258. The invalid-data notice points to a leftover mortgage block

- Status: Accepted
- Date: 2026-11-18
- Source: issue #448 follow-up (code review 2026-11, tracking #435); owner decision
  2026-11-18 (#435 comment 6965976270: "#448: keep the refusal, and add a Data check hint
  that points to the leftover block"); plan on #448 (comment 6978926170)
- Amends: [0226](0226-refuse-late-tranche-quick-refinance.md) (Consequences, "stored data":
  the invalid-data notice now names both blocks and links to Financing; the refusal itself
  is unchanged)
- Related: [0118](0118-data-check.md) and [0206](0206-data-check-grouped.md) (the Data
  check, which never renders for such a property), [0163](0163-leases-never-overlap.md) §5
  (the `dataCheck.leaseOverlap` phrasing this follows), [0248](0248-focus-after-busy-actions.md)
  (focus moves to a section heading), [0107](0107-property-section-nav.md) (section
  targets), [0152](0152-wording-log-and-generated-index.md) (new copy)
- Implementation: dictionary key `errorBoundary.leftoverBlock` (en/cs/ru); text owner OK
  2026-11-18 (#448 comment 6979206969; `docs/decisions/wording.md`, 2026-11-18 · #448 /
  ADR 0258)

## Context

Before ADR 0226 a CSV row with a corrected `start_date` was added as a new mortgage block,
and the block with the wrong date stayed. Example: _Byt Dubova_ from 12.03.2024, plus an
imported row from 01.03.2024. Since ADR 0226 the engine refuses the pair as
`REFINANCE_WITHIN_A_MONTH` on both blocks (`src/engine/validate/blockStarts.ts`), and
restore refuses a backup that holds one. A database from 1.5.0 can still hold such a pair.

The engine throws for such a property, so the app shows the invalid-data notice instead of
the figures: on the Dashboard through the ErrorBoundary, on Property detail in place of the
Overview. The Data check never renders there, so a Data check finding would never be
seen. The notice says only "Byt Dubova: \<rule\>": it names neither block and does not
lead to Financing.

How likely: rare. It needs a database written before ADR 0226 with a corrected start date.
Valid data cannot trigger the hint: it shows only when the engine already refuses the pair.

## Decision

1. **A hint line in the invalid-data notice.** For each pair of blocks of one property that
   the engine flagged `REFINANCE_WITHIN_A_MONTH` and whose later start is on or before
   `EDATE(earlier start, 1)`, the notice adds one line `errorBoundary.leftoverBlock` naming
   the property and both start dates (dd.mm.yyyy), after the rule lines. The pairs are
   computed in the UI model (`leftoverBlockHints`, beside `invalidDataLines` in
   `src/ui/model/invalidData.ts`) from the engine's errors and the stored blocks. The
   text names the section as `propertyDetail.sectionFinancing` does (a test checks that
   it contains it).
2. **Links to Financing.**
   - **Dashboard (ErrorBoundary):** when the property that "Open property"
     (`errorBoundary.openProperty`) opens has a hint, it opens that property at its
     Financing section (`openProperty(id, "financing")`, ADR 0118 targets). Otherwise it
     opens the property as today.
   - **Property detail:** when the notice has a hint, it shows a "Go to Financing" button
     (`dataCheck.goTo` with `propertyDetail.sectionFinancing`) that moves focus to the
     Financing section's heading (`focusSection`, as the section nav does). The button
     lives in `InvalidDataNotice`; `PropertyDetail.tsx` does not change.
3. **Unchanged:** the engine rule and its refusal, the store, the CSV import, the shared
   rules, the restore refusal and its issue table, and the notice for every other rule.
4. **New copy, one key `errorBoundary.leftoverBlock`** (en/cs/ru). The notice is
   `role="alert"`, so the line is live-region text: hence this ADR and the `wording.md`
   entry. The text is the one the owner approved on 2026-11-18 (#448 comment 6979206969).

Parked for the owner (not part of this ADR):

- A. A restore-time hint under the refused-backup issue table ("delete the leftover block
  in the app the backup came from, then export again"): needs more copy and touches
  BootFailure and the outcome regions.
- B. Marking the flagged rows in the Mortgages panel.
- C. Not recommended: a Data check finding for valid "leftover-looking" blocks; it would
  fire on real refinances.

Tests, written failing first in new files: `src/ui/model/__tests__/leftoverBlockHint.test.ts`,
`src/ui/components/__tests__/InvalidDataNoticeLeftover.test.tsx` and
`src/ui/pages/__tests__/PropertyDetailLeftoverHint.test.tsx`. No existing test changes.

## Consequences

- No figure, parity target, golden master, schema, export or backup-format change.
- Added dictionary key (en/cs/ru): `errorBoundary.leftoverBlock`. No key is removed or
  reworded.
- `docs/csv-import.md` (two blocks one month or less apart) says the notice points to the
  leftover block.
- The screens ux-capture shows are unchanged: the sample portfolio has no such pair.
