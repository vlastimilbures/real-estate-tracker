# 0140. One form parser and one message set; a thousands-shaped amount is refused

- Status: Proposed
- Date: 2026-10-06
- Source: issue #125 (R4-06, R6-05), Track 10 PR 10.1, owner decision D1 = B
- Related: [0131](0131-lossless-money-draft.md) (lossless drafts, which bound the money rule),
  [0075](0075-input-rejection-gaps.md) (whole-number bounds), [0077](0077-ux-a11y-round-b-forms.md)
  (UX-040: a message names the expected format), [0119](0119-acquisition-funding.md) §8–§9
  (the funding record), [0128](0128-assumption-bounds.md) (scenario rules)

## Context

The app had three ways to parse a form:

- RecordForm and Assumptions read their fields through `collectValues` and `FORM_PARSERS`,
  with the shared messages `forms.required`, `forms.invalidHint.*` and `forms.intRange`.
- The property form parsed by hand, with its own messages: "Use dd.mm.yyyy", "Invalid
  number", "Must be a whole number", "Invalid percentage".
- The scenario form parsed by hand too: "Invalid %", "≥ 1", "≥ 0".

So the same mistyped percentage got a different message in each form, and only the shared
set says what to type instead. The property form also passed a negative purchase price or
funding amount on for the engine to refuse, while every other money field refused it in the
form.

Separately, every money field read `450,000` or `450.000` as 450 Kč, and `1,250` as 1.25 Kč:
a single `,` or `.` is the decimal separator. An English-style thousands separator silently
saved an amount a thousand times too small.

ADR 0131 bounds the fix: a draft shows the stored amount at full precision (`1000.005`), and a
save must accept the draft it showed. So "refuse more than two decimals" would block a save of
an untouched legacy amount.

## Decision

1. **One parser path.** The property and scenario forms read their fields through
   `collectValues` with the shared rules `formRules(t)`: `FORM_PARSERS`, `forms.required` for a
   blank required field, and `fieldHint` (the kind's `forms.invalidHint.*`, or `forms.intRange`
   for a bounded whole number) for text that does not parse. The property name check ("A
   property with this name already exists") stays the property form's own.
2. **Money is non-negative in the property form.** The purchase price and the three funding
   amounts use `FORM_PARSERS.money`, so a negative amount is refused in the form with
   `forms.invalidHint.money`, like every other money field.
3. **A thousands-shaped amount is refused** (owner decision D1, option B). `parseMoney` refuses
   trimmed text matching `^-?[1-9]\d{0,2}(?:\s\d{3})*[.,]\d{3}$`: one to three digits, then
   optional whitespace-separated groups of three, then a single `,` or `.` and exactly three
   digits. It catches `450,000`, `450.000`, `1,250`, `1.250` and `1 250,000`. It covers every
   form money field, development draws and the prepayment and recast rows. Percentages are not
   affected (`4,125` % still parses).
   - The group separator is mandatory and the first digit is not 0, so `1000.005` (a lossless
     draft, ADR 0131) and `0.005` still parse, as do `1 250 000` and `25 000,50`. Four or more
     decimals are never refused.
   - `forms.invalidHint.money` says to group thousands with a space.
4. **Scenario years are bounded by the horizon.** A shock lasts 1–100 years and the crash lands
   at year 0–100 (`INT_RANGES.shockYears`, `INT_RANGES.crashYear`; the horizon is at most 100
   years, `INT_RANGES.horizonYears`). Before, any 9-digit count was accepted, with no effect
   past the horizon. A blank delta (or crash) still ignores its years.
5. The property form's whole-number size uses `forms.intRange` for any bad entry (before:
   "Must be a whole number" for a non-number, the range for an out-of-range number).
6. The now-unused messages are deleted in all three languages: `propertyForm.errRequired`,
   `errUseDate`, `errInvalidNumber`, `errWholeNumber`, `errInvalidPercentage`, and
   `scenarios.invalidPct`, `geOne`, `geZero`, `required`.

## Consequences

- One message per mistake in every form: a bad percentage says "Enter a percentage, e.g. 4,5"
  in the property, scenario and record forms.
- A stored amount with one to three integer digits and exactly three decimals (e.g. `850.125`,
  only possible from CSV import or a restore) blocks a save of its form until it is retyped;
  the message names the fix. Larger stored amounts such as `1000.005` are unaffected.
- No engine, parity or golden change.
- **Follow-ups (not in this ADR):**
  - CSV import keeps its own number grammar: it refuses `1,250` (`csv.ts`) but reads
    `450.000` as 450. Whether CSV takes the same thousands-shape rule is a separate decision.
  - The mortgage form's live instalment suggestion still reads the principal with
    `parseDecimal`, so it can show a suggestion for text the save then refuses.
