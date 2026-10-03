# 0088. As-of labels name their basis

- Status: Accepted
- Date: 2026-10-03
- Source: issue #13 (pre-release review 2026-10, finding A02)

## Context

A future As-of date makes the Dashboard and Property detail tiles show the projection year
nearest to that date (SPEC §4.3, ADR 0062). The labels still said "current", "today's lease
in force" and "Net worth in 30 years", so at +5y they described values the tiles no longer
showed. The date picker gave no sign that a date maps to a whole projection year.

## Decision

1. **One basis per as-of date**, derived from the same `projectionYearForAsOf` rule as the
   tiles (`asOfBasis`, `src/ui/model/dashboard.ts`):
   - _projection year Yk_ when the date lands on years 1 … horizon;
   - _today_ when it does not and the date is today;
   - _records in force on {date}_ otherwise (a date less than six months after the base date,
     or past the horizon).
     If the base date is six months or more in the past, Today also shows a projection year and
     is labelled as one.
2. **Horizon tile** names its end year: "Net worth in 2056 (30-yr horizon)". It does not
   depend on the As-of date.
3. **Monthly block**: at Today the title stays "Current monthly cash flow" with the hint
   "annualised run rate ÷ 12, leases in force on {date}". In a projection year it reads
   "Monthly equivalent — projection year Y5 · 2031 (Jul 2030 – Jun 2031)" with the hint
   "annual projection ÷ 12". The year label and period are the Projections table's.
4. **Annual net cash flow foot** says "current" only at Today, otherwise the projection year
   or the date.
5. **As-of picker hint** (Dashboard and Property detail): "Future dates show the nearest
   projection year (Yk · YYYY, period)"; past the horizon "Beyond the horizon — showing
   records in force on {date}, not a projection"; nothing at Today.
6. The Property detail leases hint no longer says "current rent".

## Consequences

Copy and layout only; no computed number, parity target or engine output changes. The
mapping itself (nearest whole year) is unchanged; exact-date interpolation is out of scope.
