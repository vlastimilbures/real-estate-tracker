# Architecture Decision Records

Each file records one decision: its context, the decision itself and its consequences.

## How ADRs are numbered

The ADRs were written at the end of the 2026 refactor programme from its decision log. An ADR's
number matches the programme decision it records (`D-23` → `0023`), so the many code comments
that cite `D-nn` resolve directly. Gaps are decisions that were phase gates or narrow follow-ups;
those are quoted inside the ADR they refine ("Related follow-up decisions").

Other IDs seen in code comments:

- `J-nn` (judgment calls) and `Q-nn` (open questions) were answered by a `D-nn`; the index below
  maps them.
- `DR-nnn` (debt register), `UX-nnn` (user-visible changes) and `P-nn` (phases) are legacy IDs
  from the 2026 refactor programme's internal registers, retired by ADR 0081. They are kept in
  comments for traceability; open items are summarised in [`docs/roadmap.md`](../roadmap.md).

## Writing a new ADR

1. Copy the template below to `NNNN-short-slug.md`, using the next free number above 0070.
2. Status starts as **Proposed**; the owner accepts or rejects it. Superseding an ADR means a new
   ADR plus `Status: Superseded by NNNN` on the old one.
3. A change to a computed number or any other user-visible behaviour needs an accepted ADR and a
   failing test first (ADR 0001). A change to a parity target also needs an old → new row in the
   target change log in `.claude/rules/engine-parity.md` (ADR 0003).
4. Reference the ADR in the commit footer: `Refs: ADR 0071`.

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD
- Source IDs: (optional) issue or debt IDs

## Context

## Decision

## Consequences
```

## Index

| ADR                                               | Title                                                                                  | IDs                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| [0001](0001-behaviour-change-gate.md)             | Behaviour changes need an approval gate                                                | D-01                                   |
| [0002](0002-dependency-policy.md)                 | Dependency policy                                                                      | D-02                                   |
| [0003](0003-czech-practice-decides.md)            | Czech banking practice decides disputed formulas                                       | D-03                                   |
| [0004](0004-czech-features-design-notes-only.md)  | Unmodelled Czech mortgage features: design notes only                                  | D-04                                   |
| [0005](0005-ux-audit-quick-wins.md)               | UX: audit plus quick wins                                                              | D-05                                   |
| [0006](0006-hardening-scope-e2e-optional.md)      | Hardening scope; E2E stays optional                                                    | D-06                                   |
| [0007](0007-single-master-plan.md)                | One master plan document                                                               | D-07                                   |
| [0008](0008-entered-instalment-authoritative.md)  | The entered instalment is authoritative for loan term                                  | D-08, J-02                             |
| [0009](0009-ad-hoc-signing.md)                    | Ad-hoc code signing                                                                    | D-09, Q-01                             |
| [0010](0010-excel-export-rounded.md)              | Excel export writes rounded values                                                     | D-10                                   |
| [0011](0011-private-repo-real-seed.md)            | Private repository with the real seed                                                  | D-11                                   |
| [0012](0012-no-dev-database.md)                   | No separate development database                                                       | D-12                                   |
| [0013](0013-ci-runners.md)                        | CI runners: Linux for checks, macOS only for the bundle                                | D-13, Q-02                             |
| [0014](0014-rust-transaction-command.md)          | Multi-step writes in a Rust transaction command                                        | D-14, J-13                             |
| [0015](0015-excel-library.md)                     | Keep exceljs with dependency overrides                                                 | D-15, J-16                             |
| [0016](0016-first-run-seed.md)                    | Seed the sample portfolio only on first run                                            | D-16, J-18                             |
| [0017](0017-reject-invalid-loan-inputs.md)        | Reject invalid loan inputs everywhere                                                  | D-17, J-19                             |
| [0018](0018-plan-reordering.md)                   | Re-order the plan for a data-safety hotfix                                             | D-18, J-20                             |
| [0019](0019-projection-start-asof.md)             | Projection start and the As-of lens                                                    | D-19, J-17, D-62                       |
| [0020](0020-no-instalment-rounding.md)            | No instalment rounding                                                                 | D-20, J-01                             |
| [0021](0021-schedule-calendar.md)                 | Schedule calendar: base-date grid, loan due dates                                      | D-21, J-03, D-40, D-45, D-47           |
| [0022](0022-year-labelling.md)                    | Year labelling: projection year and calendar year                                      | D-22, J-04                             |
| [0023](0023-cpi-deflator.md)                      | Real terms use a cumulative CPI index                                                  | D-23, J-05                             |
| [0024](0024-draw-timing.md)                       | Draw re-amortization timing                                                            | D-24, J-06, D-41, D-42, D-44, D-46     |
| [0025](0025-branded-types.md)                     | Branded IsoDate and Rate types in the engine API                                       | D-25, J-08                             |
| [0026](0026-mutation-testing.md)                  | Mutation testing on the engine, nightly                                                | D-26, J-09                             |
| [0027](0027-one-active-block.md)                  | One active mortgage block per property                                                 | D-27, J-14, D-43, D-47                 |
| [0028](0028-rate-shock-window.md)                 | Rate-shock window starts at each loan's fixation end                                   | D-28, J-15                             |
| [0029](0029-contract-maturity-date.md)            | Optional contract maturity date as a consistency check                                 | D-29, Q-06                             |
| [0030](0030-expired-fixation.md)                  | Expired fixation without a successor block                                             | D-30, J-21                             |
| [0031](0031-dev-loan-instalment.md)               | Development-loan instalment derived from the term                                      | D-31, J-22                             |
| [0032](0032-value-reanchor.md)                    | Value re-anchor granularity                                                            | D-32, J-23, D-45                       |
| [0033](0033-loan-first-grid-month.md)             | Loan starting in the first grid month after baseDate                                   | D-33, J-24, D-44                       |
| [0034](0034-cagr-null.md)                         | CAGR is null when starting equity is not positive                                      | D-34, J-25                             |
| [0035](0035-dscr-cap.md)                          | DSCR display cap                                                                       | D-35, J-26                             |
| [0036](0036-validation-error-list.md)             | The engine's typed validation error list                                               | D-36, D-54                             |
| [0037](0037-data-integrity-codes.md)              | Data-integrity validation codes raise                                                  | D-37, J-27                             |
| [0038](0038-range-codes.md)                       | Assumption and scenario range codes                                                    | D-38, J-28                             |
| [0039](0039-golden-master.md)                     | Keep the engine golden-master test                                                     | D-39, J-29                             |
| [0048](0048-runtime-validation.md)                | Hand-rolled runtime validation                                                         | D-48, J-07                             |
| [0049](0049-czech-excel-csv.md)                   | Czech-Excel CSV files are rejected precisely                                           | D-49, J-12, D-55                       |
| [0052](0052-restore-safety-backup.md)             | Restore safety backup                                                                  | D-52                                   |
| [0053](0053-import-limits.md)                     | Import and restore size limits                                                         | D-53                                   |
| [0057](0057-ux-capture-tool.md)                   | Permanent UX capture tool                                                              | D-57                                   |
| [0058](0058-remove-currency-tab.md)               | Remove the Currency tab; CZK is locked                                                 | D-58, Q-04                             |
| [0063](0063-hardened-runtime-apple-silicon.md)    | Hardened runtime, Apple Silicon only, macOS 13+                                        | D-63, J-10, Q-05                       |
| [0064](0064-file-io-in-rust.md)                   | File IO in Rust commands                                                               | D-64                                   |
| [0066](0066-performance-budgets.md)               | Performance budgets and measurement                                                    | D-66, J-11, D-67                       |
| [0068](0068-no-branch-protection.md)              | No server-side branch protection                                                       | D-68, J-09, D-69                       |
| [0070](0070-decision-records.md)                  | Decisions are recorded as ADRs                                                         | D-70                                   |
| [0071](0071-property-form-fixes.md)               | Property form: garage checkbox, extras, active flag                                    |                                        |
| [0072](0072-layer-map-platform-and-type-edges.md) | Layer map: platform layer, state facades, type edges                                   | DR-163…167                             |
| [0073](0073-scenario-compare-budget.md)           | Scenario-compare budget and nightly bench assertion                                    | DR-172                                 |
| [0074](0074-type-safety-pass.md)                  | Type safety: Money brand, typed forms, strict flags                                    | DR-032, DR-052, DR-053, DR-113         |
| [0075](0075-input-rejection-gaps.md)              | Input rejections: cost defaults, as-of, horizon, ints                                  | DR-176, DR-131, DR-115, DR-078         |
| [0076](0076-csv-int-bounds-and-app-name.md)       | CSV whole-number bounds and one app name                                               | DR-177, DR-175                         |
| [0077](0077-ux-a11y-round-b-forms.md)             | UX and accessibility round B: forms and dialogs                                        | DR-178, DR-150, DR-151, DR-154         |
| [0078](0078-ux-a11y-round-b-charts-menu-axe.md)   | UX and accessibility round B: chart tables, menu language, axe in CI                   | DR-144, DR-155, F-08, DR-180           |
| [0079](0079-engine-edge-cases.md)                 | Engine edge cases: month-end growth, handover tranches, shock history, late draws, IRR | DR-123, DR-126, DR-117, DR-074, DR-158 |
| [0080](0080-close-out.md)                         | Close-out: lease steps and gaps, real-terms months, review leftovers                   | DR-045, DR-182, DR-145, DR-152/157/181 |
| [0081](0081-public-release.md)                    | Public release: fictional sample portfolio, own regression baseline, archive retired   |                                        |
| [0082](0082-about-feedback-via-issues.md)         | About dialog points to GitHub issues instead of an e-mail address                      |                                        |
| [0083](0083-coverage-rebaseline-vitest-4.md)      | Coverage floors re-baselined for Vitest 4                                              |                                        |
| [0084](0084-horizon-dependent-labels.md)          | Horizon-dependent labels name the configured horizon                                   |                                        |
| [0085](0085-properties-long-names.md)             | Properties list keeps its risk columns in view                                         |                                        |
| [0086](0086-restore-int-bounds.md)                | Backup restore applies the whole-number bounds                                         |                                        |
| [0087](0087-real-lens-multiple-cumulative-cf.md)  | Real lens: real net-worth multiple and cumulative cash flow                            |                                        |
| [0088](0088-asof-basis-labels.md)                 | As-of labels name their basis                                                          |                                        |
| [0089](0089-compare-owner-loss.md)                | Scenario compare shows the owner's loss                                                |                                        |
| [0090](0090-scenario-wording.md)                  | Scenarios wording: shock units, projection start, lens                                 |                                        |
| [0091](0091-guide-about-wording.md)               | Guide and About wording matches the model                                              |                                        |
| [0092](0092-in-app-docs-pointer.md)               | Guide and About point to the limitations and data-safety docs                          |                                        |
| [0093](0093-scenario-add-flow.md)                 | Scenario add flow: no duplicate presets, new scenarios join the compare                |                                        |
| [0094](0094-sample-portfolio-clear.md)            | Label the sample portfolio and clear it in one step                                    |                                        |
| [0095](0095-assumptions-save-row.md)              | Assumptions: sticky Save row, unsaved state and error summary                          |                                        |
| [0096](0096-csv-import-preview.md)                | CSV import preview: adds and updates before importing                                  |                                        |
| [0097](0097-compare-delta-view.md)                | Scenario compare: Values / Δ vs Base view                                              |                                        |
| [0098](0098-mortgage-loan-type.md)                | Mortgage form: Standard vs Development switch and successor note                       |                                        |
| [0099](0099-close-previous-open-record.md)        | Offer to close the previous open-ended valuation or lease                              |                                        |
| [0100](0100-rate-shock-reach.md)                  | Scenarios: show which loans a rate shock hits                                          |                                        |
| [0101](0101-scenario-session-state.md)            | Scenarios: keep the compare state for the session; crash timing is a setting           |                                        |
| [0102](0102-scenario-form-groups.md)              | Scenario form: group levels, shocks and crash; no per-property override                |                                        |
| [0103](0103-financing-exposure.md)                | Financing exposure and upcoming events                                                 |                                        |
| [0104](0104-combined-stress-presets.md)           | Scenarios: combined stress presets                                                     |                                        |
| [0105](0105-one-product-name-and-format-note.md)  | One product name on every surface; language does not change formats                    | #22                                    |
| [0106](0106-collapsible-stress-presets.md)        | Scenarios: collapsible stress presets                                                  |                                        |
| [0107](0107-property-section-nav.md)              | Property detail: section nav and collapsed amortization                                | #23                                    |
| [0108](0108-scenario-compare-xlsx-export.md)      | Scenario compare: export to Excel                                                      | #56                                    |
| [0109](0109-loan-prepayments-and-recasts.md)      | Loan prepayments and recasts                                                           | #32                                    |
| [0110](0110-backup-recency-indicator.md)          | Backup recency indicator                                                               | #36                                    |
| [0111](0111-table-context-line.md)                | Table context line and visible export label                                            | #21                                    |
| [0112](0112-load-sample-on-demand.md)             | Load the sample portfolio on demand                                                    | #74                                    |
| [0113](0113-csv-boolean-message.md)               | CSV boolean error lists every accepted value                                           | #61                                    |
| [0114](0114-a11y-skip-link-charts.md)             | Accessibility round: skip link, named charts, legible axes                             | #24, #25                               |
| [0115](0115-sample-panel-hint.md)                 | Sample panel hint does not say how the sample arrived                                  | #97                                    |
| [0116](0116-prepayments-ui-and-review-fixes.md)   | Prepayments: form, outputs and review fixes                                            | #32                                    |
| [0117](0117-property-loan-outlook.md)             | Property loan outlook: each block's reset and the remaining term                       | #31                                    |
| [0118](0118-data-check.md)                        | Data check: stale, defaulted and missing inputs                                        | #35, #178                              |
| [0119](0119-acquisition-funding.md)               | Acquisition funding record and the down payment of a future buy                        | #33, #103, #140, #118                  |
| [0120](0120-tranche-on-recast-payment.md)         | A tranche on an instalment recast's payment                                            | #109                                   |
| [0121](0121-first-positive-cash-flow-strict.md)   | The first cash-flow-positive year is strictly positive                                 | #102, #185                             |
| [0122](0122-valuation-persists-past-valid-to.md)  | A valuation keeps governing after its "Valid to" date                                  | #110                                   |
| [0123](0123-scenario-rules-every-entry-point.md)  | Scenario overrides meet the engine rules; restore needs them readable                  | #107, #108                             |
| [0124](0124-pre-purchase-debt-service.md)         | Debt service before a future purchase is owner cash                                    | #104                                   |
| [0125](0125-committed-write-reload-failure.md)    | A committed write whose reload fails is not a failure                                  | #106                                   |
| [0126](0126-degenerate-kpis.md)                   | Degenerate KPIs: no growth base, debt-free from, no-debt badge                         | #129                                   |
| [0127](0127-opaque-property-ids-sample-match.md)  | Random property ids; the sample is matched by id and name                              | #101, #105                             |
| [0128](0128-assumption-bounds.md)                 | Assumption bounds: reset rate, growth floor, shocked levels                            | #114                                   |
| [0129](0129-loan-schedule-edge-cases.md)          | Loan schedule edge cases: late tranches, interest-only date, last draw, refix gap      | #135                                   |
| [0130](0130-interest-saved-refinance.md)          | Interest saved only when a prepayment applied; refinance difference apart from draws   | #172                                   |
| [0131](0131-lossless-money-draft.md)              | A form drafts a stored amount or rate at full precision                                | #201, #208                             |
| [0132](0132-reload-export-write-order.md)         | The banner Reload and the backup export follow the write order                         | #138, #199                             |
| [0133](0133-ltv-yield-zero-value.md)              | LTV and yields with no value read n/a, not 0 %                                         | #129                                   |
| [0134](0134-acquisition-cash-gaps.md)             | Later first loan of an owned property; principal repaid before baseDate                | #181, #193                             |
| [0135](0135-whole-year-loan-term.md)              | A loan term must be whole years                                                        | #226                                   |
| [0136](0136-shorten-term-agreed-instalment.md)    | Shorten term keeps the instalment the next payment pays                                | #228                                   |
| [0137](0137-agreed-instalment-pays-interest.md)   | Payment q pays at least its interest                                                   | #225                                   |
| [0138](0138-refinance-handover-edge-cases.md)     | Refinance handover edge cases                                                          | #229, #221, #223                       |
| [0139](0139-last-tranche-cap.md)                  | A projection tranche lands no later than payment term−1                                | #218                                   |
| [0140](0140-one-form-parser.md)                   | One form parser and one message set; a thousands-shaped amount is refused              | #125                                   |
| [0141](0141-form-errors-stay-in-form.md)          | A form's input errors stay in the form; editing a field clears its error               | #125                                   |
| [0142](0142-row-switch-guard-busy-dialog.md)      | A row switch asks before it drops typed edits; a busy dialog cannot be closed          | #132                                   |
| [0143](0143-one-confirm-row.md)                   | Confirm rows name the record, take focus and stay open on failure                      | #132                                   |

### Judgment calls and open questions

| ID   | Answered by                                                                        |
| ---- | ---------------------------------------------------------------------------------- |
| J-01 | [0020](0020-no-instalment-rounding.md)                                             |
| J-02 | [0008](0008-entered-instalment-authoritative.md)                                   |
| J-03 | [0021](0021-schedule-calendar.md)                                                  |
| J-04 | [0022](0022-year-labelling.md)                                                     |
| J-05 | [0023](0023-cpi-deflator.md)                                                       |
| J-06 | [0024](0024-draw-timing.md)                                                        |
| J-07 | [0048](0048-runtime-validation.md)                                                 |
| J-08 | [0025](0025-branded-types.md)                                                      |
| J-09 | [0026](0026-mutation-testing.md)                                                   |
| J-10 | [0063](0063-hardened-runtime-apple-silicon.md)                                     |
| J-11 | [0066](0066-performance-budgets.md)                                                |
| J-12 | [0049](0049-czech-excel-csv.md)                                                    |
| J-13 | [0014](0014-rust-transaction-command.md)                                           |
| J-14 | [0027](0027-one-active-block.md)                                                   |
| J-15 | [0028](0028-rate-shock-window.md)                                                  |
| J-16 | [0015](0015-excel-library.md)                                                      |
| J-17 | [0019](0019-projection-start-asof.md)                                              |
| J-18 | [0016](0016-first-run-seed.md)                                                     |
| J-19 | [0017](0017-reject-invalid-loan-inputs.md)                                         |
| J-20 | [0018](0018-plan-reordering.md)                                                    |
| J-21 | [0030](0030-expired-fixation.md)                                                   |
| J-22 | [0031](0031-dev-loan-instalment.md)                                                |
| J-23 | [0032](0032-value-reanchor.md)                                                     |
| J-24 | [0033](0033-loan-first-grid-month.md)                                              |
| J-25 | [0034](0034-cagr-null.md)                                                          |
| J-26 | [0035](0035-dscr-cap.md)                                                           |
| J-27 | [0037](0037-data-integrity-codes.md)                                               |
| J-28 | [0038](0038-range-codes.md)                                                        |
| J-29 | [0039](0039-golden-master.md)                                                      |
| Q-01 | [0009](0009-ad-hoc-signing.md)                                                     |
| Q-02 | [0013](0013-ci-runners.md)                                                         |
| Q-03 | Open: no bank statements were provided; see [0020](0020-no-instalment-rounding.md) |
| Q-04 | [0058](0058-remove-currency-tab.md)                                                |
| Q-05 | [0063](0063-hardened-runtime-apple-silicon.md)                                     |
| Q-06 | [0029](0029-contract-maturity-date.md)                                             |
