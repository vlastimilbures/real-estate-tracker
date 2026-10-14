# Roadmap & known limitations

What is not done yet, in plain language. Ideas and bugs are welcome as
[GitHub issues](https://github.com/vlastimilbures/real-estate-tracker/issues). IDs in brackets (`DR-nnn`) are legacy references that still
appear in code comments (ADR 0081).

## Done: the 2026-10 reviews

Every issue from the 2026-10 pre-release review
([record](reviews/2026-10-gpt-pre-release-review.md), label
[`review-2026-10`](https://github.com/vlastimilbures/real-estate-tracker/issues?q=label%3Areview-2026-10),
#11–#38) and the 2026-10 code review
([record](reviews/2026-10-claude-code-review.md), label
[`review-2026-10-code`](https://github.com/vlastimilbures/real-estate-tracker/issues?q=label%3Areview-2026-10-code),
#101–#178) is closed; each closed issue links the ADR or PR that resolved it. New work is
tracked as [GitHub issues](https://github.com/vlastimilbures/real-estate-tracker/issues).

## Feature ideas (no issue yet)

- **Per-property growth in scenarios.** SPEC §7 allows a scenario to override appreciation and
  rent indexation per property; scenarios currently override the portfolio-wide assumptions
  only. A scenario also cannot clear a shock set on the base. (DR-077)
- **Prepayment what-ifs in Scenarios.** A scenario cannot add, remove or change a prepayment,
  so "repay 500,000 at the next fixation end" vs "keep the cash" cannot be compared side by
  side: scenarios change only Assumptions, and a prepayment belongs to one loan. Today: add it,
  read the KPIs and interest saved, then delete it. Belongs with per-property scenario
  overrides (DR-077). (#158, decided: ADR 0109)
- **More Czech mortgage features.** The annual partial-prepayment allowance, a per-loan payment
  day and first partial-month interest. Designed but not built:
  [`docs/design/czech-mortgage-extensions.md`](design/czech-mortgage-extensions.md) §§2–4.
  One-off prepayments and maturity changes are #32 (ADR 0109).
- **Multi-currency.** Each record keeps its own currency, a reporting currency is set in
  Settings, and FX rates are entered or imported by hand to stay offline. This needs a scope ADR
  first, covering four decisions: single currency vs display conversion vs true multi-currency;
  the real-terms basis under FX; how existing records are migrated to CZK; and how a property and
  its mortgage may differ in currency. CZK stays locked until then. A currency picker that only
  relabels amounts was removed on purpose (ADR 0058).
- **Return on cash invested.** Cash-on-cash return and since-purchase IRR. Gated on complete dated
  contributions; not supportable today.
- **Resilience metrics.** Minimum DSCR and the year it occurs, peak funding shortfall (deepest
  cumulative negative cash position), and break-even rent/occupancy.
- **Property sale event.** Record a sale with proceeds, selling costs and loan payoff, instead of
  deactivating the property; this keeps its history. Builds on the acquisition funding record (ADR 0119).
- **Planned capital expenditure.** Dated one-off repairs and renovations, modelled separately from
  the percentage maintenance allowance.
- **Optional property details.** Notes, parking spaces, a structured category and layout,
  building year, floor and energy rating, and the source of each valuation (the Data check, ADR
  0118, could then name it). Ownership share comes later, because it changes how debt, costs and
  income are attributed.
- **Sort and search on lists.** Sortable columns and search on Properties and Scenarios for
  larger portfolios.
- **Auto-convert Czech-Excel CSV files** (semicolon, decimal comma, Windows-1250). Today such
  files are rejected with a message that names the fix (ADR 0049).
- **Native-speaker review of the Russian translation.** All three languages are complete and
  type-checked; the Russian domain terms have not been reviewed by a native speaker. (DR-097)

## Considered, not planned

Out of scope for a local, single-user planning tool (SPEC §2, §10). Reconsidered only if the
product's positioning changes.

- **Actual-vs-plan tracking.** Needs a transaction ledger and reconciliation.
- **Multiple portfolios or entities.**
- **Cloud sync, accounts, bank connections, a mobile app, tax filing or advice.**

## Known limitations

- **Several development loans on one property.** One development loan per property
  (optionally refinanced into a plain loan) is the supported case. (DR-124)
- **Month-end base dates.** The engine counts payments and grid months on loan due dates, so
  results are correct, but two date helpers remain whose semantics differ at month ends; new
  code should use `lastGridMonthOnOrBefore`. (DR-070)

## Code health

- **Mutation score.** The engine scores ~98.7 % under Stryker (nightly breaks below 98 %).
  The surviving mutants are equivalent (no observable difference), defaults no caller can
  reach, or the text of engine error messages, which the UI never shows. (DR-168)
- **Bundle size.** Startup JavaScript is ~234 kB gzip plus the active UI dictionary
  (~19–24 kB), down from ~329 kB; every page but the Dashboard and Properties, and the date
  picker calendar, load on first use, and the other dictionaries load only on a language
  switch. Most of the rest is Recharts (~108 kB, which the Dashboard needs at start).
  (DR-009)
- **Type tightening.** Plain and development loans share one type with optional fields
  (DR-051); a few helpers still take loose `Record<string, string>` drafts (DR-081); stored
  boolean flags are typed as numbers at the database boundary (DR-080); `D()` still accepts a
  JS `number` (DR-078).
- **Tests.** The two optional Playwright smoke tests (ADR 0006) run nightly and on manual dispatch
  (`e2e.yml`), not on every pull request.
- **Row editor focus.** Adding a prepayment or maturity-change row does not move focus to
  its date, and removing one leaves focus on the next row's button or the page (PR #100
  review).
