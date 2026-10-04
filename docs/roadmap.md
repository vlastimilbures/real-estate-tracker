# Roadmap & known limitations

What is not done yet, in plain language. Ideas and bugs are welcome as
[GitHub issues](https://github.com/vlastimilbures/real-estate-tracker/issues). IDs in brackets (`DR-nnn`) are legacy references that still
appear in code comments (ADR 0081).

## Planned (tracked as issues)

From the 2026-10 pre-release review
([record](reviews/2026-10-gpt-pre-release-review.md), label
[`review-2026-10`](https://github.com/vlastimilbures/real-estate-tracker/issues?q=label%3Areview-2026-10)).
Priority labels: **P1** before promoting the app for real financial decisions, **P2** next
improvement, **P3** later.

- **Clearer financial meaning (P1).** Real-terms multiple and cumulative cash flow (#11), labels
  that follow the horizon (#12), selected date vs projection horizon on the Dashboard (#13), owner
  loss in a price-crash comparison (#14), scenario wording and units (#15), Guide and About wording
  (#16).
- **First use and layout (P1).** Long property names (#17), sample portfolio label and "start my
  own" (#18).
- **Editing and readability (P2).** Save pattern (#19), mortgage form (#20), table units and
  export label (#21), one product name (#22), property detail navigation (#23), skip link and
  chart names (#24), chart legibility (#25).
- **Documentation.** SPEC brought in line with the code (#26), an owner-first README (#27), model
  limitations and data safety (#28), a CSV import guide (#29), precise quality claims and a
  docs-impact check (#30).
- **Features.**
  - Financing exposure and upcoming events: next fixation, debt resetting, remaining term,
    total interest (#31). Done: the Dashboard panel (ADR 0103) and the property page's
    Loan outlook (ADR 0117).
  - Early repayment: one-off extra principal, as in
    [`czech-mortgage-extensions.md`](design/czech-mortgage-extensions.md) §1 (#32).
  - Acquisition funding: own cash, costs, initial works (#33).
  - CSV import preview showing adds vs updates (#34).
  - Data-check panel (#35).
  - Backup recency indicator (#36).

From the 2026-10 code review
([record](reviews/2026-10-claude-code-review.md), label
[`review-2026-10-code`](https://github.com/vlastimilbures/real-estate-tracker/issues?q=label%3Areview-2026-10-code),
#101–#174). Each issue has evidence, decision options and a recommendation.

- **Bugs to fix first (P1).** Value falls back to the purchase price after a valuation's
  "Valid to" date, property ids derived from the name, Clear sample vs the owner's own
  property, unchecked scenario rows in a restore, a restore misreported as rolled back,
  out-of-range scenario inputs, future and development purchases in the returns, a tranche
  after an instalment recast, and the first cash-flow-positive year (#101–#110).
- **Decisions (label `decision`).** Modelling and process choices challenged with options and
  the case for keeping them; weak challenges stay in the record only.
- **Clean-up (label `tech-debt`), docs, accessibility and smaller fixes (P2, P3).**

## Feature ideas (no issue yet)

- **Per-property growth in scenarios.** SPEC §7 allows a scenario to override appreciation and
  rent indexation per property; scenarios currently override the portfolio-wide assumptions
  only. A scenario also cannot clear a shock set on the base. (DR-077)
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
- **Return on cash invested.** Cash-on-cash return and since-purchase IRR. Gated on acquisition
  funding (#33) and complete dated contributions; not supportable today.
- **Resilience metrics.** Minimum DSCR and the year it occurs, peak funding shortfall (deepest
  cumulative negative cash position), and break-even rent/occupancy.
- **Property sale event.** Record a sale with proceeds, selling costs and loan payoff, instead of
  deactivating the property; this keeps its history. Builds on #33.
- **Planned capital expenditure.** Dated one-off repairs and renovations, modelled separately from
  the percentage maintenance allowance.
- **Optional property details.** Notes, parking spaces, a structured category and layout,
  building year, floor and energy rating, and the source of each valuation (the Data check, ADR
  0118, could then name it). Ownership share comes later, because it changes how debt, costs and
  income are attributed.
- **Sort and search on lists.** Sortable columns and search on Properties and Scenarios for
  larger portfolios.
- **Mortgage draw editor.** Date/amount rows instead of the one-tranche-per-line text field (see
  #20).
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
- **Tests.** The two optional Playwright smoke tests do not run in CI (ADR 0006). (DR-094)
- **Dead fallback.** A no-schedule snapshot fallback for development loans is unreachable from
  the app and could be removed. (DR-118)
- **Row editor focus.** Adding a prepayment or maturity-change row does not move focus to
  its date, and removing one leaves focus on the next row's button or the page (PR #100
  review).
