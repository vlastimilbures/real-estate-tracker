# 0131. A form drafts a stored amount or rate at full precision

- Status: Accepted
- Date: 2026-10-04 (amended 2026-10-04 for rates, issue #208)
- Source: issue #201 (independent review of PR #198, finding 8); issue #208 (rates)
- Related: [0119](0119-acquisition-funding.md) §8 (the property form saves the record it
  shows), [0074](0074-type-safety-pass.md) (money at the mapper boundary)

## Context

`moneyDraft` turned a stored amount into a form's editable text with
`toDecimalPlaces(2)`. CSV import, backup restore and form entry itself accept a plain decimal
of any precision, and every form saves the record it shows. So an unrelated edit, such as
renaming a property, rewrote an amount imported, restored or typed with more than two
decimals: `own_cash` `1000.005` was saved as
`1000.01`. The same held for every money field a form drafts: purchase price and funding,
valuations, leases, mortgages and their draws, prepayments and recasts, holding costs and
the Assumptions defaults. The change was below one crown and never shown, but it was a silent
write of a figure the owner did not touch. Two edge cases failed outright: a positive amount
below 0.005 drafted as `0`, which a positive-only field then refused, and a restored amount
in exponent form (`1e+21`) drafted as text the form could not parse.

Rates had the same flaw (issue #208). `percentDraft` drafted a stored ratio as a percentage
rounded to four decimals (`times(100).toDecimalPlaces(4)`), i.e. the ratio to six. An edit
rewrote a mortgage `interest_rate_pa` of `0.03591234` as `0.035912`, and a ratio below
`0.0000005` drafted as `0`. Every rate a form drafts is a stored one: a property's growth
overrides, its holding-cost percentages, a mortgage's interest rate, the Assumptions rates
and defaults, and a scenario's overrides and shocks.

Options (issues #201 and #208):

1. **Lossless draft:** draft the stored precision, in plain notation.
2. **Write only what changed:** each form keeps the stored value when its draft is unchanged.
3. **Bound the precision at the boundary:** CSV import and restore refuse or round money with
   more than two decimals, or rates with more than six.

## Decision

Option 1, for money and rates. `moneyDraft` returns `Decimal.toFixed()`: the stored value in
full, in plain notation (never `1e-8` or `1e+21`), with no trailing zeros. `percentDraft`
returns `times(100).toFixed()`, and the percent parse divides by 100 again. Draft and parse
round-trip exactly, so a save writes back the amount or rate it read. Scaling by 100 keeps
the digits, so the rate round trip is exact for any ratio of up to 40 significant digits,
the Decimal precision the engine computes at (`src/lib/money.ts`).

Option 2 needs a baseline in every form path for the same result. Option 3 adds a
user-visible rejection and could refuse an older backup, or would itself round stored data.

The mortgage form's Calc fill drafts a computed instalment through `moneyDraft`; the engine
already rounds that suggestion up to whole crowns, so its text is unchanged.

## Consequences

- An amount imported with more than two decimals shows them in its form field, e.g.
  `1000.005`. Display elsewhere still rounds to whole Kč (CLAUDE.md §5).
- A rate imported with more than six decimals shows them as a percentage, e.g. `3.591234`.
  Display elsewhere still rounds to `0.0%`.
- No engine, parity or golden change. An amount with at most two decimals, and a rate with at
  most six, drafts exactly as before (trailing zeros were already dropped: `12000000.50` →
  `12000000.5`, `0.0359` → `3.59`).
