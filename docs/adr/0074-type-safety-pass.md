# 0074. Type-safety pass: Money brand, typed form values, strict index and optional access

- Status: Accepted
- Date: 2026-10-02
- Source IDs: DR-032, DR-052, DR-053, DR-113 (P11 follow-ups F-04 and F-05, P13 plan)
- Amends: [0025](0025-branded-types.md)

## Context

The P11 review scored type safety "Below". It found three gaps:

- Money is a bare `Decimal`. ADR 0025 branded only `IsoDate` and `Rate`, so a rate or a
  plain decimal still type-checks in a Kč field.
- About 30 casts (`as Decimal`, `as Rate`, `as IsoDate`, `as MortgageBlock`) turn the forms'
  untyped parse results into engine values. DR-113 put this down to a layer rule that let the
  UI import only engine types. ADR 0072 allows runtime imports from the engine, so the parsers
  can call the brand constructors.
- `noUncheckedIndexedAccess` is on for the engine only (DR-052), and
  `exactOptionalPropertyTypes` was off with no recorded decision.

## Decision

Owner, 2026-10-02 (P13 plan):

1. **`Money` brand on engine inputs only.** `Money = Decimal & { [moneyBrand]: true }`, built
   with `money(value)` in `src/engine/brands.ts`. It covers the input fields that hold Kč
   amounts: cost defaults, purchase price, market value, monthly rent, initial principal,
   instalment, draw amount, and holding-cost overrides. Outputs and arithmetic stay `Decimal`,
   the same as `Rate`. This amends ADR 0025, which kept Money bare.
2. **Brand casts only in constructors.** `as Money`, `as Rate` and `as IsoDate` are allowed
   only in `engine/brands.ts` and `engine/dates.ts`. `as MortgageBlock` is allowed only in a
   `mortgageBlock()` constructor next to `isDevLoan`. The mapper boundary, CSV import and form
   parsers call these constructors.
3. **Typed form values.** A form's field specs set the types of its parsed values
   (`ParsedValues<S>`: `money` → `Money`, `pct` → `Rate`, `date` → `IsoDate`, optional → `| null`).
   Pages read typed values with no casts. ADR 0072 supersedes DR-113's stated blocker.
4. **`noUncheckedIndexedAccess` for all non-test `src`** (`tsconfig.strict.json`, part of
   `pnpm typecheck`). Test files stay off (about 640 errors, fixture indexing). Fixes use real
   guards, not `!`.
5. **`exactOptionalPropertyTypes` on for all of `src`, tests included.**
6. **Lint guard.** ESLint rejects brand casts outside the constructors, and non-null `!`
   assertions, in non-test `src`.

## Consequences

Types only: no computed number, message or screen changes. The golden master, parity, bench
and mutation score stay the same. Test fixtures build money inputs with `money()`. New
code that indexes arrays or records handles the missing case explicitly.
