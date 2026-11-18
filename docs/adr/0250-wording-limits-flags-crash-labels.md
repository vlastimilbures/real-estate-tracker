# 0250. Translated garage flag; limit and crash-label texts in names and alerts

- Status: Accepted
- Date: 2026-11-18
- Source: issue #441 (code review 2026-11, tracking #435, findings R05-12, R10-08, R10-15,
  R10-16); owner decision 2026-11-18 (#435 comment 6965976270, "Copy": all four items
  approved, an ADR for item 3)
- Related: [0152](0152-wording-log-and-generated-index.md) (what the wording log covers),
  [0185](0185-csv-missing-columns-and-preview-clarity.md) (the CSV preview's change
  text), [0191](0191-state-fixes-preset-match.md) (a preset matches a saved scenario by
  its settings), [0206](0206-data-check-grouped.md) (the grouped Data check),
  [0079](0079-engine-edge-cases.md) (the IRR search range)

## Context

1. The CSV import preview shows a changed garage flag as English "true" / "false" in every
   language (`src/ui/model/importPreview.ts`, `showValue`). The dictionary has no "No"
   entry; `propertyForm.garageYes` is the property form's checkbox text.
2. Items 1, 2 and 4 of #441 are copy changes logged in `docs/decisions/wording.md`. Some of
   the texts they change are also accessible names or live-region announcements, which
   the wording log does not cover (CLAUDE.md §8, ADR 0152):
   - `inputRules.RATE_OUT_OF_RANGE` and `inputRules.INVALID_RECAST_MATURITY` show in the
     invalid-data notice and a form-level error, both `role="alert"`;
   - `dataCheck.valuationStaleGroup` and `dataCheck.leaseEndingGroup` are the Data check
     problem text that each chip's `aria-labelledby` reads after the property name;
   - `common.irrNoRoot` is the screen-reader text of an "n/a" IRR and a note in the
     compare Excel export;
   - the crash preset labels are the visible text of the preset buttons, part of their
     accessible names, and part of the name a preset saves (`scenarios.crashTitle`).

## Decision

1. **Garage flag.** The preview shows a garage flag as `common.yes` / `common.no` (new
   keys; en "Yes" / "No", cs "Ano" / "Ne", ru "Да" / "Нет") in the UI language.
   `changeText` takes the dictionary. The full-precision fallback of ADR 0185 §4 is not
   reached for a flag, since "0" and "1" always read differently.
2. **Names and announcements.** The texts in Context 2 change as the wording log entries
   of 2026-11-18 (#441 items 1, 2 and 4) say, in the places listed there as well:
   - the rate range message reads "from 0 to 100 %" in the alert regions too;
   - the recast, Data check and IRR texts take their limits as arguments; at today's
     limits the words are unchanged, and the IRR range reads with the thousands space
     of `fmtPct` ("+1 000 %"), on screen, for screen readers and in the export note;
   - a crash preset's label is built from its fall with `fmtPct` (`crashLevel` in
     `src/ui/model/scenarios.ts`), so the button and the saved name read "−10,0 %"
     instead of "−10%".

## Consequences

- No computed number, limit or stored value changes, and no engine output moves; the IRR
  bracket constants only gain a name for their upper bound (`IRR_BRACKET_MAX`).
- A crash preset saved before this change keeps its stored name ("Price crash −10%"); a
  new save is named "Price crash −10,0 %". The preset still finds the older scenario,
  since it matches by settings (ADR 0191), so no duplicate is saved.
- A future change to `INT_RANGES.loanTermYears`, the Data check thresholds or the IRR
  bracket changes the texts in all three languages with it.
- The CSV parser's own rate message (`importPage.errRateOutOfRange`) keeps its fraction
  wording: a CSV rate is written as a fraction.
