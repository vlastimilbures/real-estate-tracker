# Roadmap & known limitations

What is not done yet, in plain language. Ideas and bugs are welcome as
[GitHub issues](https://github.com/vlastimilbures/real-estate-tracker/issues). IDs in brackets (`DR-nnn`) are legacy references that still
appear in code comments (ADR 0081).

## Features

- **Per-property growth in scenarios.** SPEC §7 allows a scenario to override appreciation and
  rent indexation per property; scenarios currently override the portfolio-wide assumptions
  only. A scenario also cannot clear a shock set on the base. (DR-077)
- **More Czech mortgage features** — penalty-free prepayment at fixation end, the annual
  partial-prepayment allowance, a per-loan payment day and first partial-month interest.
  Designed but not built:
  [`docs/design/czech-mortgage-extensions.md`](design/czech-mortgage-extensions.md).
- **Auto-convert Czech-Excel CSV files** (semicolon, decimal comma, Windows-1250). Today such
  files are rejected with a message that names the fix (ADR 0049).
- **Native-speaker review of the Russian translation.** All three languages are complete and
  type-checked; the Russian domain terms have not been reviewed by a native speaker. (DR-097)

## Known limitations

- **Several development loans on one property.** The value ramp during construction follows
  the first development loan in input order; one development loan per property (optionally
  refinanced into a plain loan) is the supported case. (DR-124)
- **Form drafts round percentages to 4 decimal places** when a value is edited and saved.
  (DR-079)
- **Month-end base dates.** The engine counts payments and grid months on loan due dates, so
  results are correct, but two date helpers remain whose semantics differ at month ends; new
  code should use `lastGridMonthOnOrBefore`. (DR-070)

## Code health

- **Mutation score.** The engine scores ~97.6 % under Stryker; the surviving mutants are
  mostly error-message text and boundary comparisons that no test pins. (DR-168)
- **Bundle size.** Startup JavaScript is ~289 kB gzip; route-level splitting of the chart
  pages would cut it further. (DR-009)
- **Type tightening.** Plain and development loans share one type with optional fields
  (DR-051); a few helpers still take loose `Record<string, string>` drafts (DR-081); stored
  boolean flags are typed as numbers at the database boundary (DR-080); `D()` still accepts a
  JS `number` (DR-078).
- **Tests.** The two optional Playwright smoke tests do not run in CI (ADR 0006), and Node 26
  prints a `localStorage` warning during the test run. (DR-094)
- **Dead fallback.** A no-schedule snapshot fallback for development loans is unreachable from
  the app and could be removed. (DR-118)
