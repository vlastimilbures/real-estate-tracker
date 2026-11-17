# 0245. The store refuses a write that adds an out-of-range value

- Status: Accepted (owner-delegated, night run 2026-11-16; owner review pending)
- Date: 2026-11-18
- Source: issue #464 (code review 2026-11, tracking #435: the input rules in one place),
  part 4; the plan posted on #464; non-critical decisions delegated by the owner for the
  2026-11-16 night run
- Amends: [0086](0086-restore-int-bounds.md) (§1: the store applies the bounds too; §3:
  `OUT_OF_RANGE` is no longer restore-only, and still not an engine rule)
- Related: [0075](0075-input-rejection-gaps.md) §5 and
  [0076](0076-csv-int-bounds-and-app-name.md) §1 (the bounded ranges in the forms and CSV
  import), [0148](0148-restore-rules-vs-stored-data.md) §1 (restore brings an out-of-range
  value in after "Restore anyway"), [0141](0141-form-errors-stay-in-form.md) §1 (an input
  error stays in the form, out of the banner), [0243](0243-hidden-field-save-error.md) §1
  (a save error on a field the form is not showing goes above the buttons),
  [0232](0232-dates-before-1900-entry-only.md) (the date floor is entry-only),
  [0128](0128-assumption-bounds.md) §6 (an assumptions edit that newly breaks a saved
  scenario), [0236](0236-size-one-decimal.md) §1 (the size takes one decimal place),
  [0244](0244-engine-reads-lib-rules.md) §1 (one module names the input rules)

## Context

The bounded fields have one set of ranges (`INT_RANGES` in `src/lib/rules.ts`): the
projection horizon 1–100, the fixation 0–50 years, the loan term 1–50 years, and the size
1–10 000 m² with at most one decimal place. The forms, CSV import and restore apply them
(ADR 0075, ADR 0076, ADR 0086). The store, which every form writes through, checks the
engine input rules only, and those are open-ended above (ADR 0086 §2). So a store write
with a horizon of 150 years or a fixation of 60 saves (`storeRangeToday.test.ts` pins it).

No user can reach this today: every form parses these fields, hidden ones included,
against the same ranges before it calls the store. The gap is in the store's contract, and
a later caller that skips the form's parse (#489, #490) would fall into it.

A database may already hold such a value: restore asks and brings it in after "Restore
anyway" (ADR 0148 §1), and an older database may hold one from before the bounds. Refusing
every write while one is stored would lock the owner out of unrelated edits.

## Decision

1. **The store applies the ranges.** Before writing a property, a mortgage block or the
   assumptions, the store checks the candidate data against the bounded ranges
   (`rangeProblems`), as the forms, CSV import and restore do.
2. **Only what the write adds or changes is refused.** The store compares the problems of
   the stored data with those of the candidate, by record and field. It refuses a problem
   that is new, or whose value the write changes. A write that leaves a stored
   out-of-range value as it is, or fixes it, goes through; so does the same record with
   another field changed. Writes to valuations, leases and holding costs never touch a
   bounded field; scenario writes are not range-checked (item 6).
3. **Order: engine rules, then ranges, then scenarios.** The engine input rules run first,
   unchanged: a horizon of 0 or a loan term of 0.5 is still refused with its own rule
   (`HORIZON_NOT_POSITIVE`, `INVALID_TERM`) and nothing else. Then the ranges. Then, for
   the assumptions, the saved scenarios the edit would newly break (ADR 0128 §6).
4. **The refusal is an input error** (ADR 0141): it is returned to the form, not put in the
   banner, and not logged. `OUT_OF_RANGE` (and `BEYOND_LIMIT`, its hard-limit form) still
   does not become an engine rule: the engine and the database stay open-ended (ADR 0086
   §2).
5. **Text and field are the form's own.** The refusal shows the form's range message,
   `forms.intRange` (horizon, fixation, loan term) or `forms.sizeRange` (size), on the
   field the form uses (`horizonYears`, `fixationYears`, `loanTermYears`, `sizeM2`). A field
   the form is not showing gets it above the buttons (ADR 0243 §1). No dictionary entry is
   added or changed.
6. **Unchanged:** deletes and (de)activating a property, which run no rules; CSV import,
   which checks its own plan (ADR 0076); restore, Load sample and Clear sample, which
   replace the data with their own checks (ADR 0148); scenario writes; and the date floor,
   which stays entry-only (ADR 0232). Applying the scenario form's shock and crash years
   (`SHOCK_YEARS`, `CRASH_YEAR`) or the date floor in the store is left to the owner: each
   could refuse data stored today.
7. **Tests are written failing first:** each refusal fails before the change, and plain
   tests prove that a stored out-of-range value blocks no other write.

## Owner review

If the owner prefers the store to stay with the engine rules only, the fallback is to drop
the range step; `storeRangeToday.test.ts` then pins today's acceptance again.

## Consequences

- No form or flow changes: every form already refuses these values before it calls the
  store, with the same message on the same field.
- A store write that adds a value outside the ranges, or changes a stored one to another
  out-of-range value, is refused before anything is written.
- A database holding such values keeps loading, and every other edit saves, including one
  that fixes the value.
- `storeRangeToday.test.ts` flips its three pinned acceptances (horizon 150, fixation and
  loan term 60, size 20 000 m²) to refusals.
- No figure, export, stored data, dictionary entry or layout changes; parity and the golden
  master do not move.
