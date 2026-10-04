# 0131. A form drafts a stored money amount at full precision

- Status: Accepted
- Date: 2026-10-04
- Source: issue #201 (independent review of PR #198, finding 8)
- Related: [0119](0119-acquisition-funding.md) §8 (the property form saves the record it
  shows), [0074](0074-type-safety-pass.md) (money at the mapper boundary)

## Context

`moneyDraft` turned a stored amount into a form's editable text with
`toDecimalPlaces(2)`. CSV import and backup restore accept a plain decimal of any precision,
and every form saves the record it shows. So an unrelated edit, such as renaming a property,
rewrote an amount imported with more than two decimals: `own_cash` `1000.005` was saved as
`1000.01`. The same held for every money field a form drafts: purchase price and funding,
valuations, leases, mortgages and their draws, prepayments and recasts, holding costs and
the Assumptions defaults. The change was below one crown and never shown, but it was a silent
write of a figure the owner did not touch.

Options (issue #201):

1. **Lossless draft:** draft the stored precision, in plain notation.
2. **Write only what changed:** each form keeps the stored value when its draft is unchanged.
3. **Bound the precision at the boundary:** CSV import and restore refuse or round money with
   more than two decimals.

## Decision

Option 1. `moneyDraft` returns `Decimal.toFixed()`: the stored value in full, in plain
notation (never `1e-8` or `1e+21`), with no trailing zeros. Draft and parse round-trip
exactly, so a save writes back the amount it read.

Option 2 needs a baseline in every form path for the same result. Option 3 adds a
user-visible rejection and could refuse an older backup, or would itself round stored data.

The mortgage form's Calc fill drafts a computed instalment through `moneyDraft`; the engine
already rounds that suggestion up to whole crowns, so its text is unchanged.

## Consequences

- An amount imported with more than two decimals shows them in its form field, e.g.
  `1000.005`. Display elsewhere still rounds to whole Kč (CLAUDE.md §5).
- No engine, parity or golden change; amounts entered in a form (≤ 2 decimals in practice)
  draft as before, minus trailing zeros (`12000000.50` → `12000000.5`, as `toString` did).
- Rates are out of scope: `percentDraft` still drafts a ratio to 6 decimals, the same class
  of silent rewrite; tracked as issue #208.
