# Real Estate Tracker — Pre-release Product and Documentation Review

> **Triage note (2026-10-03).** External review, kept verbatim below as the source record. Every
> finding was re-checked against `main` @ `4ab5d8f` and the current `ux-capture` set; the screenshots
> it cites match today's captures. Outcome, tracked under the
> [`review-2026-10`](https://github.com/vlastimilbures/real-estate-tracker/issues?q=label%3Areview-2026-10)
> label:
>
> - **App:** A01 #11 · A02 #13 (+ hardcoded horizon labels #12) · A03 #14 · A09 #15 · A15 #16 ·
>   A05 #17 · A13 #18 · A04 #19 · A08 #20 · A06 #21 · A16 #22 · A07 #23 · A11 #24 · A12 #25.
>   A10 became feature #34. A14 is mostly addressed already (clear confirmation text); what remains
>   is documentation in #28.
> - **Docs:** D01–D03 #26 · D04–D05 #27 · D06–D07 #28 · D09 #29 · D08 + D10 #30.
> - **Features:** F5 + reminders #31 · F3 #32 · F1 #33 · import preview #34 · data check #35 ·
>   backup recency #36. Everything else (F7 multi-currency, resilience metrics, sale event, capex,
>   optional property fields, list sort/filter) is in [`docs/roadmap.md`](../roadmap.md).
> - Already in place before this review: modal focus trap, keyboard-reachable property rows, one
>   transaction for each import batch, issue templates and a security policy, release `.dmg`.

**Prepared:** 3 October 2026  
**Release context:** Public open-source repository; intended audience described by the owner as “anyone.”  
**Status:** Recommendations for owner validation. No application, code, or repository documentation has been changed.  
**Review method:** Supplied screenshots and documents only. No independent-agent review, as requested to control costs.

> **Bottom line:** Prioritize financial meaning, trustworthy documentation, and a clear first-use journey before expanding the feature set. The supplied UI already has a coherent visual identity and useful safeguards. The strongest improvements are not a wholesale redesign: clarify what each number measures, make editing and navigation more predictable, and prevent users from mistaking projections for realized returns. Multi-currency and early repayment are model changes, not merely extra controls.

## Contents

1. [Executive summary](#1-executive-summary)
2. [Scope, evidence, and limitations](#2-scope-evidence-and-limitations)
3. [Application findings](#3-application-findings)
4. [Repository documentation findings](#4-repository-documentation-findings)
5. [Assessment of your seven improvement areas](#5-assessment-of-your-seven-improvement-areas)
6. [Additional feature candidates](#6-additional-feature-candidates)
7. [Prioritized recommendations and sequencing](#7-prioritized-recommendations-and-sequencing)
8. [Release-readiness checks](#8-release-readiness-checks)
9. [Decisions reserved for you](#9-decisions-reserved-for-you)
10. [Review completeness and evidence register](#10-review-completeness-and-evidence-register)

---

## 1. Executive summary

### 1.1 Release assessment

**Recommendation: a narrowly positioned open-source release is a more defensible next step than presenting this as a general-purpose international property-investment product.** The current specification explicitly targets a single-user, offline macOS application, CZK, and Czech mortgage conventions; it identifies the primary user as finance-literate. That is materially narrower than the intended broad public audience. Public availability does not require immediately supporting every market or every operating system. It does require clearly explaining the supported audience and limitations. **Evidence:** `SPEC.md` §§1–3, 8, 10; `README.md`, introduction and “Prerequisites.”

**No confirmed catastrophic implementation defect is established by the supplied evidence.** Equally, this is not a release certification: source code, executable builds, test results, migration results, and a complete repository were not supplied. Treat the checks in §8 as verification gates, not as accusations that the app fails them.

The owner subsequently clarified that the screenshot set is not the very latest. Accordingly, **screen-specific findings describe the supplied visual baseline and require confirmation against the release build**. The About screen's version difference is deliberately excluded from the actionable findings.

### 1.2 Highest-value actions

1. **Make financial basis explicit.** The screenshots mix selected-date snapshots with fixed-horizon results; the Real view retains a nominal-looking multiple and cumulative cash-flow figure. Resolve the definitions and labels before changing formulas. See A01–A03.
2. **Reconcile the specification with the changelog and Guide.** IRR search behavior, lease projection behavior, and stress presets have concrete documentary discrepancies. See D01–D03.
3. **Improve editing without defaulting to autosave.** Use one consistent, form-scoped Save/Cancel pattern and visible unsaved state. Keep explicit saves for financial inputs. See A04 and F4.
4. **Make long and wide screens easier to use.** Protect important columns from long names, clarify dates and units, and separate property records from long analytical tables. See A05–A07 and F6.
5. **Give public users an understandable entry point.** Explain current platform/currency scope, how to run the app, how to start with their own data, and what backups do. See D04–D08.
6. **Build the financial foundation before adding return metrics.** Record acquisition funding cleanly; only then offer cash-on-cash or since-purchase performance. Stage early repayment and true multi-currency behind explicit model decisions. See F1, F3, F5, F7.

### 1.3 What is already working well in the supplied evidence

- **Recognizable visual system:** consistent dark surfaces, teal actions, restrained accent colors, and repeated card/form patterns. Preserve this identity rather than redesigning every component. **Evidence:** `01-dashboard.png`, `11-property-add-modal.png`, `60-settings-assumptions.png`.
- **Useful visible safeguards:** required-field errors, row/field-specific import errors, cascade-delete wording, deactivation wording, and an unsaved-change dialog are present. These are positive UI observations, not proof of the underlying transactions. **Evidence:** `12-property-add-errors.png`, `13-property-delete-confirm.png`, `23-property-deactivate-confirm.png`, `24-property-record-leave-guard.png`, `51-import-errors.png`.
- **Existing accessibility affordances:** visible focus outlines, textual LTV/DSCR bands, and chart table alternatives. Do not recommend these as if they were wholly absent. **Evidence:** `01-dashboard.png`, `07-dashboard-chart-table.png`, `90-keyboard-focus-tab1.png`, `90-keyboard-focus-tab8.png`, `90-keyboard-focus-tab20.png`.
- **Substantial existing financial coverage:** LTV, DSCR, NOI, cap rate, cash flow, IRR, CAGR, debt-free year, scenario comparisons, and nominal/real presentations are already represented. The next priority is meaning and usability, not adding more headline tiles. **Evidence:** `01-dashboard.png`, `42-scenarios-compare.png`, `70-guide.png`; `SPEC.md` §§4.3, 4.6.
- **Strong technical-documentation foundation:** the README explains architecture, checks, local data, and privacy; the specification records formulas and exceptions; the changelog describes behavioral changes. The problem is keeping those sources aligned and making them approachable. **Evidence:** `README.md`, “Architecture,” “Checks,” and “Security & Privacy”; `SPEC.md` §4; `CHANGELOG.md`, 1.2.0 and 1.3.0.

---

## 2. Scope, evidence, and limitations

### 2.1 Agreed scope

This review covers application usability, UI, evidence-supported functionality, consistency, accessibility indicators, release readiness, and repository documentation. It evaluates your original six improvement areas, the added multi-currency proposal, and additional feature brainstorming in a separate importance-ranked table.

Excluded: implementing changes, live-app testing, source-code inspection, external research, legal or regulatory validation, a vulnerability audit, and an independent-agent review. Recommendations are proposals, not an approved backlog.

### 2.2 Input validation

**44 supplied files were readable:** 38 PNG screenshots, four Markdown files, and two JSON records. All screenshots have a recorded width of 1280 pixels; heights vary between viewport captures and full-page captures. No corrupt screenshot or malformed keyboard JSON was encountered. Exact filenames and review coverage are recorded in §10.

- `README.md`, `SPEC.md`, and `CHANGELOG.md`: substantive content reviewed.
- `CLAUDE.md`: presence and text readability validated; contributor-instruction content is outside the substantive findings in this report. **The documentation assessment is therefore not a complete content review of all four Markdown files.**
- Both keyboard records: reviewed as narrow test observations, not a comprehensive accessibility audit.
- Long property and Guide screenshots: inspected in enlarged sections as well as full-page views.

### 2.3 Evidence vocabulary

| Label                 | Meaning                                                  | Example of appropriate use                                                                     |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Observed**          | Directly visible in a supplied screenshot or record      | A control is at the top of a form; a visible label retains the same value across two captures. |
| **Documented**        | A supplied document states the behavior                  | Restore is described as transactional; this review has not executed a restore.                 |
| **Inference**         | A plausible explanation, not confirmed implementation    | A higher crash-scenario IRR may result from rebasing initial equity.                           |
| **Recommendation**    | A proposed improvement or product judgment               | Prefer a sticky form action row over per-keystroke autosave.                                   |
| **Verification gate** | A material behavior needs checking on the actual release | Restore failure leaves existing data intact.                                                   |

**Confidence refers to the evidence, not implementation certainty.** “High” means the stated screen observation or document conflict is clear. “Medium” means the impact or explanation is interpretive. A high-confidence observation from an older screenshot is not a high-confidence claim about the latest build.

### 2.4 Priority scale

| Priority                  | Meaning                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **P0 — Blocker**          | A confirmed issue makes release unacceptable, for example demonstrated destructive data loss. None is established here. |
| **P1 — Before release**   | Resolve, verify, or explicitly disclose before promoting the app for real financial decisions.                          |
| **P2 — Next improvement** | Meaningful usability or capability improvement; a bounded release need not wait.                                        |
| **P3 — Optional/later**   | Useful only for selected users or after foundational decisions.                                                         |
| **Gate**                  | Evidence required for a release decision; not a confirmed bug or feature request.                                       |

Feature importance and release urgency are deliberately separate. A high-value feature can remain P2 if adding it would introduce disproportionate release risk.

### 2.5 Material limitations and updated assumptions

- **Screenshot age:** the owner clarified that the screenshots are not the latest set. Reconfirm A-series issues before treating them as current defects; do not create a release task merely to change the displayed About version.
- **No executable or code:** actual persistence, calculations, transaction boundaries, build reproducibility, security controls, keyboard activation, and performance remain unverified.
- **One visible presentation context:** supplied screens show English and dark styling. Light/System behavior, Czech/Russian layouts, minimum-window layout, zoom, and assistive-technology behavior cannot be certified.
- **Partial repository:** referenced release, contribution, architecture-decision, design, license, and financial-oracle materials were not supplied. “Not supplied” is not “missing from the repository.”
- **Broad audience versus specific model:** recommendations assume a broad public readership, but preserve the documented Czech/CZK scope unless you approve expanding it.
- **No jurisdictional claims:** prepayment allowances, fees, and mortgage rules must not be inferred from a generic feature name or presented as legally validated.

---

## 3. Application findings

### A01 — Real mode does not make every KPI's basis clear

**Priority:** P1 · **Evidence confidence:** High for display; calculation cause unknown.

**Observed:** `01-dashboard.png` and `02-dashboard-real.png` show net worth at horizon changing from **109,628,836 Kč** to **52,263,792 Kč**, while the **net-worth multiple stays 4.85×** and **cumulative net cash flow stays 17,300,824 Kč**. The Real KPI panel says “real terms where applicable”; the hero subtitle says “4.85x today · real.” **Documented:** `SPEC.md` §4.6 defines the multiple as horizon equity divided by opening equity; §4.5 describes deflating monetary projection values by cumulative CPI.

**Why it matters:** A reader cannot readily distinguish a nominal-only KPI from one converted to purchasing power. A real wealth multiple is not analogous to LTV or DSCR: its numerator and denominator concern different dates, so inflation need not cancel.

**Diagnostic, not engine verification:** Using the displayed opening equity of **22,605,406 Kč** from `07-dashboard-chart-table.png`, the nominal terminal multiple is **4.8497×** and the real terminal multiple is **2.3120×**. Those calculations explain why retaining 4.85× under a Real label needs clarification. They do not establish which calculation path the app actually uses.

**Recommendation:** Define each KPI as lens-sensitive or explicitly nominal-only. Either convert the multiple consistently or label it “Nominal multiple — from projection start.” For cumulative cash flow, decide between nominal total and the sum of individually CPI-deflated period flows; do not deflate the nominal sum once at the terminal CPI. State the basis on the row.

**Acceptance check:** Every financial KPI identifies currency, nominal/real basis, and period; each Real-mode result reconciles to its documented definition. Preserve ratios that genuinely remain invariant.

### A02 — Selected-date snapshots and projection-start results are blended

**Priority:** P1 · **Confidence:** High.

**Observed:** `03-dashboard-asof-5y.png` selects **01.10.2031**, but still says “NET WORTH IN 30 YEARS,” “4.85x today,” “Current monthly cash flow,” and “today's lease in force.” Its equity **31,887,535 Kč** matches Y5 in `30-projections.png`, whose period is labeled **Jul 2030–Jun 2031**. `SPEC.md` §4.3 explicitly documents that a future as-of date displays the matching projection-year row. This is a **documented annual approximation presented with an exact-date control**, not proof of an implementation bug.

**Additional basis issue:** The displayed 4.85× corresponds to opening equity, not the selected snapshot. Using `01-dashboard.png`'s selected-date equity gives a terminal/current ratio of **4.7602×**; using `03-dashboard-asof-5y.png` gives **3.4380×**. Both were calculated from the displayed terminal amount, not from internal app data.

**Recommendation:** Separate “Position at selected date” from “Projection: start to horizon.” Use an explicit terminal year/date rather than “in 30 years” when the selected date has moved. Explain annual-row mapping beside the future-date control. Rename the monthly block “Monthly equivalent of annual projection” in future views and remove “today's lease” there. For a current snapshot, label an annualized run rate rather than implying a bank-account ledger.

**Acceptance check:** A user can identify the exact snapshot/annual period, horizon endpoint, and denominator without opening the Guide. Changing as-of does not silently redefine horizon KPIs.

### A03 — A property-price crash appears to improve returns without explanation

**Priority:** P1 · **Confidence:** High for values; Medium for explanation.

**Observed:** In `42-scenarios-compare.png`, “Price crash −20%” has lower terminal nominal net worth (**87.7 M Kč** versus **109.6 M Kč**) but higher multiple (**5.53×** versus **4.85×**), CAGR (**5.9%** versus **5.4%**), and IRR (**6.9%** versus **6.2%**). The selected crash timing is Today. `SPEC.md` §§4.5–4.6 defines the haircut and opening-equity-based return vector.

**Inference:** Rebasing initial equity after a year-zero loss could produce a higher subsequent return on a smaller starting value. Using the displayed opening assets and debt, a 20% asset haircut gives illustrative opening equity of **15,845,406 Kč**; the rounded crash terminal value divided by that gives approximately **5.53×**. This supports the denominator hypothesis but does not prove the IRR implementation.

**Recommendation:** Show initial equity, terminal equity, and absolute loss versus Base alongside return measures. Explain whether the initial loss is included in the measured investment return or whether the metric measures recovery from the shocked starting point. Do not simply “fix” the IRR to be lower without choosing the economic question.

**Decision:** Existing-owner downside analysis and buying at a newly discounted price are different comparisons. Preserve both only if clearly named; otherwise choose one for the first release.

**Acceptance check:** A Today crash cannot be mistaken for an improvement in the owner's wealth merely because its percentage-return denominator is smaller.

### A04 — Save placement and edit scope are inconsistent

**Priority:** P2; make error discoverability a P1 check · **Confidence:** High.

**Observed:** Assumptions has a top-right Save button above two long groups, with no corresponding bottom action in `60-settings-assumptions.png`. Valuation edits save at the bottom of the local form (`21-property-valuation-edit.png`); holding costs have a separate bottom save (`20-property-detail.png`). Errors can occur in both the upper and lower Assumptions groups (`61-settings-assumptions-error.png`, `62-settings-assumptions-bounds.png`). A property unsaved-change guard already exists in the supplied evidence (`24-property-record-leave-guard.png`).

**Recommendation:** Use one explicit Save/Cancel row per edit scope, preferably a sticky footer within the main content/form area for long forms. Show “Unsaved changes,” a save-in-progress state, and an unambiguous saved/failed result. Keep section-level saves only where the sections are genuinely independent. Do not add a global Save that appears to save unrelated open forms.

**Acceptance check:** The action remains reachable at the bottom and by keyboard; errors are summarized and linked to fields; a failed save retains input. Do not let a sticky row obscure the last field.

### A05 — Long property names displace useful list information

**Priority:** P1 · **Confidence:** High for supplied layout.

**Observed:** `10-properties.png` displays LTV, NOI, and net cash flow. In `14-properties-long-name.png`, a long first property name consumes much more width, and those risk/cash-flow columns are not visible in the captured viewport while Edit/Delete remain visible. The evidence does not establish whether those columns are hidden, moved, or recoverable through scrolling.

**Recommendation:** Constrain the name column, allow a readable second line or accessible full-name disclosure, and protect key numerical columns. Consider moving Delete into a clearly labeled secondary action menu, not hiding ordinary navigation. Provide an obvious horizontal-overflow treatment if the table remains wider than the viewport.

**Acceptance check:** A long name cannot make LTV/cash flow effectively undiscoverable at the supported minimum width. Full names remain available to keyboard and screen-reader users.

### A06 — Tables need stronger units, date context, and overflow cues

**Priority:** P1 for meaning; P2 for convenience · **Confidence:** High.

**Observed:** The Properties list shows money without an explicit currency in its headers and has no visible as-of date (`10-properties.png`). The Projections table extends beyond the visible right edge; its export control is an icon (`30-projections.png`, `31-projections-real.png`). The Real view subtitle does not state the base-date currency as explicitly as the dashboard trajectory does (`02-dashboard-real.png`).

**Recommendation:** Add a compact context line: snapshot date, currency, and whether flows are annual or monthly. Keep year/property identity visible while scrolling; provide column groups or a compact/full view. Label export actions “Export Excel,” with tooltips as supplementary help rather than the only visible explanation. Make real-money base date explicit.

**Acceptance check:** Users can explain the unit and period of every visible column and reach all columns by keyboard. Sticky headers/columns and scrolling behavior require runtime verification; they are not declared absent here.

### A07 — Property detail combines routine maintenance with long analytical output

**Priority:** P2 · **Confidence:** High for density, Medium for task impact.

**Observed:** `20-property-detail.png` places snapshot cards, charts, valuations, leases, mortgage blocks, holding-cost inputs, the annual projection, and amortization on one long page. `22-property-mortgage-add-errors.png` adds a large mortgage form within it.

**Recommendation:** Keep a short overview, then offer clear sections such as Records, Financing, and Projections, using accessible tabs or section navigation. Keep record summaries visible, but show editable fields when requested. Default long schedules to a dedicated expandable section rather than letting them dominate the page.

**Trade-off:** Tabs reduce scrolling but hide context. Preserve a visible summary and deep links/section navigation; do not fragment short related forms across many screens.

### A08 — Mortgage entry exposes advanced concepts too early

**Priority:** P2 · **Confidence:** High.

**Observed:** The mortgage form simultaneously shows fixation, inferred/entered term, instalment, a Calc control, development draws entered as text lines, interest-only completion, and contract maturity (`22-property-mortgage-add-errors.png`). `SPEC.md` §§4.1–4.4 distinguishes plain and development loans and allows only one active mortgage block per property, with later blocks replacing earlier ones.

**Recommendation:** Start with “Standard mortgage” versus “Development mortgage,” then reveal relevant fields. Replace tranche text syntax with date/amount rows if development loans are important to the initial audience. Explain “successor/refinance” before users add a second block; do not imply support for two simultaneous loans if the model remains one-active-block.

**Acceptance check:** A user can add an ordinary mortgage without interpreting construction fields; a second loan cannot be mistaken for an independent concurrent liability.

### A09 — Scenario controls need clearer semantics and less accidental commitment

**Priority:** P1 for meanings; P2 for interaction · **Confidence:** High.

**Observed:** The preset header says “shocks revert after 3y” while a Price crash group sits in the same panel (`40-scenarios.png`, `42-scenarios-compare.png`). The specification defines the value haircut as permanent (`SPEC.md` §7), and the Guide describes it as a one-off fall followed by growth from the lower base (`70-guide.png`, “Scenarios”). The form labels shocks “+pp” but the inputs have a percent suffix (`41-scenario-form.png`). The preset text says one click creates a saved scenario.

**Recommendation:** Scope the three-year reversion text to rate/inflation shocks; label the price-level shock as permanent. Distinguish percentage points from percentage changes with a small worked example. Show the effective assumptions, start basis, and duration in comparison results. Consider preview-before-save if presets are primarily exploratory; retain one-click saving only if intentional and easy to undo/delete.

**Additional check:** “Pick up to 3 to compare against Base” should make it clear whether Base counts toward the limit; the screenshots alone do not settle the maximum. Define “Today” against the projection start or actual selected date, rather than relying on a hidden year-zero mapping.

### A10 — Import validation is useful, but consequences need to be visible earlier

**Priority:** P1 for overwrite semantics; P2 for layout · **Confidence:** High.

**Observed:** `50-import.png` provides four large file sections and templates. `51-import-errors.png` gives useful row/field errors and disables the import action; `52-import-done.png` reports “1 added or updated” and clears selections. `SPEC.md` §6 documents natural-key upserts and file-format restrictions.

**Recommendation:** Before committing, distinguish records that will be added from records that will be updated. Show affected entity names and make the all-or-nothing scope explicit. Put CSV format rules and property matching near the entry point. Retain detailed errors, but summarize them near the main action. After success, keep the report and offer navigation to the affected records.

**Unknown:** The screenshots do not prove whether a preview exists in an uncaptured state or whether all selected files share one transaction. Verify, then document the actual behavior.

### A11 — Keyboard evidence is promising but incomplete

**Priority:** P1 verification gate; P2 efficiency improvement · **Confidence:** High for supplied records.

**Observed:** `90-keyboard-focus-order.json` records 30 focus entries; the as-of input is entry 21, after navigation, language, theme, lens, and property filters. Its recorded text is empty, as is the text for focusable chart SVGs. `90-keyboard-property-row.json` records `rowFocusable: true`. Visible outlines occur in the tab-1, tab-8, and tab-20 screenshots.

**Interpretation limits:** Empty text in this capture is **not proof of a missing accessible name**; the capture may not record the accessibility tree. A focusable row is not proof that Enter/Space opens it. No conformance failure is asserted from those records alone.

**Recommendation:** Verify accessible names and roles, chart/table alternatives, calendar keyboard operation, modal focus trapping/return, row activation, live error/status announcements, and screen-reader table relationships. Consider a skip-to-content control and efficient grouped-control navigation; reduce repeated tab stops without removing keyboard access.

### A12 — Small secondary text and chart labels deserve a focused legibility pass

**Priority:** P2, with P1 accessibility verification · **Confidence:** Medium for legibility risk.

**Observed:** Charts and helper text use small muted labels across the supplied dark screens. In `02-dashboard-real.png` and `05-dashboard-filter.png`, some axis-unit labels wrap close to other axis text. The dashboard repeats many cards and charts in a long page (`01-dashboard.png`).

**Recommendation:** Prioritize readable chart ticks, concise units, and adequate space for negative values. Distinguish overlapping scenario series with line patterns or direct labels, not color alone. Reduce repeated labels and decorative visual weight before removing useful information. Retain the existing table alternatives.

**Limit:** No numerical contrast failure, font-size failure, or WCAG conformance verdict has been measured here. Check the release at minimum supported window size, zoom, and all themes.

### A13 — Empty states are helpful, but a first-run owner journey is not established

**Priority:** P1 for explanation; P2 for onboarding enhancement · **Confidence:** High.

**Observed:** The empty Dashboard offers Add property and Import CSV (`80-empty-portfolio.png`); the empty Properties page instead points to the button above and mentions CSV without an inline import action (`80-empty-properties.png`). `SPEC.md` §5 and `CHANGELOG.md` 1.2.0 say a sample portfolio is seeded on first run.

**Recommendation:** Clearly identify sample data and explain how to begin with a personal portfolio without accidentally mixing the two. Align empty-state actions. Provide a short journey: set projection assumptions, add a property, add financing if applicable, add lease/cost information, review results, export backup.

**Unknown:** First-run sample labeling and transitions were not captured. Do not conclude that the app lacks them; verify before adding duplicate onboarding.

### A14 — Deactivation is not a property sale, and restore is not ordinary import

**Priority:** P1 for interpretation and data protection · **Confidence:** High.

**Observed:** The deactivation confirmation says the property is excluded from dashboards and projections until reactivated, without deleting data (`23-property-deactivate-confirm.png`). Delete explicitly cascades and cannot be undone (`13-property-delete-confirm.png`). Restore says it overwrites all current data and writes a safety backup (`64-settings-backup.png`). These distinctions are positive, but their consequences are substantial.

**Recommendation:** Explicitly state that deactivation does not record a sale, proceeds, loan payoff, or historical realized return. Preserve the cascade warning and give each destructive action a stable, predictable confirmation layout. Explain how users recover from the safety backup; verify the restore preview and failure behavior in §8.

**Unknown:** The confirmation screenshots do not establish storage guarantees or the full restore journey.

### A15 — Guide explanations overstate some financial meanings

**Priority:** P1 · **Confidence:** High.

**Observed/documented conflicts:** `70-guide.png`, “Returns over the horizon,” describes IRR as return on money put in and defines the multiple using equity “today”; `SPEC.md` §4.6 instead starts the forward IRR vector with equity at projection start. The Guide's “30-year projection” text states principal repaid must exactly equal starting debt and that the loan is fully paid off; `SPEC.md` §4.5 qualifies the invariant to loans retiring inside the horizon and includes later draws. The Guide's “Snapshot metrics” describes net cash flow as what actually lands in the owner's pocket; the documented model is a calculated flow, not a transaction ledger (`SPEC.md` §§4.3, 10).

**Recommendation:** Separate actual historical cash, modeled current run rate, and projected future flows. Explain starting-equity opportunity cost versus original cash invested, terminal-equity assumptions, and excluded taxes/disposal costs. Qualify the principal invariant and subsequent-draw treatment. Add short “What this does not mean” notes to IRR, net cash flow, and deactivation.

### A16 — Branding and locale behavior need a deliberate public-facing contract

**Priority:** P2 · **Confidence:** High.

**Observed:** The sidebar/loading identity uses “Real Estate Portfolio,” while `README.md` and `65-about.png` use “Real Estate Tracker.” English screens retain Czech date/number conventions and Kč, consistent with `SPEC.md` §8 and `README.md`, “Features.” This is not automatically a localization bug.

**Recommendation:** Choose one product name and treat any other wording as a clear descriptor. Explain that language, regional formatting, and currency are separate choices. If keeping Czech formatting for the first release, say so prominently; do not assume adding English labels makes the model international.

---

## 4. Repository documentation findings

### D01 — The specified IRR algorithm conflicts with the newer changelog

**Priority:** P1 · **Confidence:** High.

`SPEC.md` §4.6 states a bisection bracket of **[−0.9, 1]** and null when no sign change is bracketed. `CHANGELOG.md` 1.3.0, “Changed,” says IRR is found up to **1000%** and displays “n/a” with a reason when flows have no unique IRR. Those are materially different descriptions of supported bounds and failure behavior.

**Recommendation:** Reconcile the current algorithm, domain, uniqueness handling, and user-visible failure reasons in one authoritative definition, then link the Guide and changelog to it. Distinguish “no root in the supported range” from “no unique economically meaningful IRR.” A simple sign-change bracket by itself does not demonstrate uniqueness for arbitrary cash-flow patterns.

**Acceptance:** The specification, tests, examples, and UI messages describe the same supported behavior. This review does not determine which implementation is present.

### D02 — The annual-rent formula no longer fully describes the stated lease behavior

**Priority:** P1 · **Confidence:** High.

`SPEC.md` §4.5 describes annual rent with a simple indexed starting rent. `CHANGELOG.md` 1.3.0, “Changed,” says projections follow leases month by month, honor new lease starts, earn no rent during gaps, and treat the last lease as renewed. `SPEC.md` §4.3 describes an in-force selector and an upcoming-record fallback; the interaction with final-lease renewal is not fully explained.

**Recommendation:** Document one consistent rule for pre-first-lease periods, overlapping/adjacent records, gaps, final expiry, future acquisition, and indexation at a new lease start. Add a small timeline example showing the annual aggregation and explain where snapshot and projection rules differ.

**Acceptance:** A contributor can derive a year's rent from the documented lease timeline without guessing. Do not infer a rent-calculation defect merely from this documentation lag.

### D03 — Stress presets and some screen contracts have drifted

**Priority:** P1 for stress semantics; P2 for other discrepancies · **Confidence:** High.

- `SPEC.md` §7 lists presets “Rates +2pp,” “Low growth,” “High inflation,” and “Recession,” with parameter choices unlike the grouped temporary-shock/price-crash controls shown in `40-scenarios.png`. Screenshot age means the latest UI must be checked before selecting which description to retain.
- `SPEC.md` §9 describes activate/deactivate actions and LTV/DSCR bands on the Properties list. The supplied list shows LTV and Edit/Delete, while Deactivate is visible in property detail (`10-properties.png`, `23-property-deactivate-confirm.png`).
- `SPEC.md` §4.1 specifies a positive whole-number horizon without an upper bound; `62-settings-assumptions-bounds.png` displays a 1–100 rule. Document whether this is a UI-specific limit or shared validation.
- `SPEC.md` §7 describes a comparison honoring the Nominal/Real lens; supplied scenario captures have no visible lens control, though the key table presents both nominal and real terminal wealth (`40-scenarios.png`, `42-scenarios-compare.png`). This establishes an unclear UI contract, not proof the lens is ignored.

**Recommendation:** Maintain a short screen/behavior contract for the release and identify exactly which data and presets it documents. Separate planned behavior from implemented-and-verified behavior.

### D04 — README onboarding is more contributor-oriented than owner-oriented

**Priority:** P1 · **Confidence:** High.

`README.md` moves from features into technical stack, architecture, and layout before prerequisites and Quick Start. Quick Start begins with dependency installation, development launch, and release build commands. It does not itself provide a full nondeveloper first-use journey or a clear source-only-versus-installable-release choice.

**Recommendation:** Near the top, provide “Who this is for,” “Current limits,” “Run it,” and “Start your own portfolio,” followed by a screenshot and a simple use case. Split the run path into **build from source** and **install a packaged build, if one is distributed**. For source-only publication, say that plainly; a binary distribution is not assumed mandatory.

**Acceptance:** A visitor can identify supported OS/hardware, currency, user profile, and the next action before reading architecture. Source setup includes repository acquisition, working-directory context, exact supported dependency versions, and a clean-run check.

### D05 — Important linked materials were not included in the evidence set

**Priority:** Gate / P1 release check · **Confidence:** High for evidence limitation.

`README.md`, “Documentation,” “Checks,” and “License,” references contribution guidance, release guidance, architecture decisions, design notes, license text, and parity/oracle material. Their contents were not supplied, so link validity and completeness cannot be judged here.

**Recommendation:** Verify that all linked materials ship in the public repository, are accessible at the release tag, and do not depend on private files. Verify that the license text matches the README claim and that project/dependency notices are appropriate. Keep public financial definitions in public-facing documentation rather than requiring readers to navigate contributor-specific guidance.

**Do not misread this finding:** It does not say the repository lacks a license, contributing guide, security policy, or release instructions. Those items need inspection in the actual repository.

### D06 — Financial limitations need a prominent user-facing home

**Priority:** P1 · **Confidence:** High.

`SPEC.md` §§4.3–4.6 contains important approximations: annualized snapshot flows, monthly-grid interest, successor loan blocks, and a terminal-equity IRR vector. §10 lists unsupported prepayments, payment-day/partial-month details, transaction ledger, tax modeling, and FX. These limitations are dispersed and much less prominent in the README's feature framing.

**Recommendation:** Add a concise “Model assumptions and limitations” section, linked from the README and Guide. Cover current-equity versus historical-cash returns, no actual-cash ledger, no tax-filing support, terminal-equity versus net sale proceeds, lease-renewal assumptions, one active loan per property, interest/date conventions, and forecast uncertainty. Explain that results are planning estimates, not lender quotes or guaranteed outcomes.

### D07 — Public support, release, and recovery expectations need verification

**Priority:** P1 · **Confidence:** Medium; linked documents unavailable.

`README.md`, “Security & Privacy,” describes local data, lack of at-rest encryption beyond FileVault, no updater, and ad-hoc signing. Quick Start advises a backup before using a new build. These are useful disclosures, but the attached README alone does not establish the complete upgrade, rollback, support, or clean-machine installation experience.

**Recommendation:** Verify or add concise instructions for reporting issues with sanitized examples, obtaining updates, backup-before-upgrade, supported data-version transitions, recovery after a failed migration, and platform support boundaries. If binaries are distributed, provide version-matched signing/notarization information and integrity verification. Avoid recommending broad disabling of operating-system protections.

**Acceptance:** A user can distinguish a supported workflow from an unsupported one and report a problem without posting their personal portfolio or backup publicly.

### D08 — Quality claims should point to versioned evidence and precise tolerances

**Priority:** P1 for misleading claims; P2 for presentation · **Confidence:** High.

`README.md`, “Features,” calls the app accessible and references axe-checked WCAG basics; “Checks” lists CI commands. Those are documented claims, not test results supplied to this review. `CHANGELOG.md` 1.0.0 uses “to the cent” while also stating a **±1 Kč** tolerance; the About screenshot similarly says figures reconcile to the cent, whereas the README uses ±1 Kč with approved exceptions.

**Recommendation:** Use exact tolerance language and distinguish decimal arithmetic precision, displayed rounding, workbook parity tolerance, and correctness of economic assumptions. Link release-specific test results and the approved exception record. Explain that automated accessibility checks complement, rather than replace, manual keyboard and screen-reader testing.

**Acceptance:** Claims remain specific and auditable without implying that a CI badge or decimal arithmetic proves all outputs economically correct.

### D09 — CSV documentation needs a user-oriented example and transaction scope

**Priority:** P1 for data semantics; P2 for tutorial · **Confidence:** High.

`SPEC.md` §6 documents UTF-8/comma restrictions, decimal-rate input, natural-key upserts, and entity limits. It says a whole file is rejected on any error and that the write is one transaction. The UI offers “Import selected files” (`51-import-errors.png`), leaving a reader to determine whether atomicity is per file or across the selected batch. The README's brief “Czech-Excel CSV detected and explained” phrasing does not itself make rejection as clear as the specification does.

**Recommendation:** Publish a small copyable example for each entity, specify required/optional columns and rate units, explain insert-versus-update matching and property renaming, and state exactly which records remain unchanged on any failure. Explain that development draws and holding costs are not imported through these CSVs (`SPEC.md` §6). Distinguish native Excel projection export from supported import formats.

### D10 — Document ownership and release reconciliation should be explicit

**Priority:** P2 · **Confidence:** Medium; process recommendation.

The conflicts in D01–D03 show that having detailed documentation is not enough if behavior descriptions drift. `README.md`, `SPEC.md`, and `CHANGELOG.md` serve different readers, while the in-app Guide adds another explanation surface.

**Recommendation:** Establish a release checklist with named content responsibilities: README for discovery/onboarding, SPEC for current behavioral definitions, Guide for user explanations, changelog for changes, and contribution/release documents for workflows. Add a short documentation impact check whenever formulas, presets, supported ranges, or data formats change. Preserve historical changelog entries as history rather than rewriting them to describe the current app; correct misleading tolerance wording with context.

---

## 5. Assessment of your seven improvement areas

### 5.1 Summary

| ID  | Your improvement area                         | User value                                                   | Suggested timing                                         | Conditional complexity                                       | Main dependency or decision                                                     |
| --- | --------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| F1  | Initial purchase cash in addition to mortgage | High                                                         | P2 feature; P1 clarification of existing return meanings | Medium for funding record; High for historical performance   | Original acquisition funding versus current equity; complete cash-flow history. |
| F2  | Additional apartment fields                   | Medium–High when tied to a task                              | P2, selective                                            | Low–Medium for metadata; High for ownership calculations     | Avoid expanding the required add form or duplicating leases/costs.              |
| F3  | Early repayments                              | High for borrowers                                           | P2                                                       | High                                                         | Dated repayment events, loan sequencing, payment-versus-term policy, fees.      |
| F4  | Unclutter forms and improve Save placement    | High                                                         | P2; P1 validation/error checks                           | Low–Medium relative to model work                            | Agree form scope and consistent explicit-save behavior.                         |
| F5  | Additional key metrics                        | High for a small targeted set                                | P2; fix A01–A03 first                                    | Low–High depending on source data                            | Distinguish modeled versus actual and available versus missing inputs.          |
| F6  | Overall UI improvements                       | High                                                         | P1 targeted clarity fixes, P2 restructuring              | Low–Medium for labels/layout; higher for interaction changes | Preserve current identity and accessibility.                                    |
| F7  | Multi-currency support in Settings            | High for international users; lower within current CZK scope | P2 unless essential to launch positioning                | High for true multi-currency                                 | Currency model, FX timing/source, inflation basis, migrations.                  |

**Complexity is a planning judgment, not an implementation estimate.** No source code was reviewed and no delivery dates are implied.

### F1 — Record the owner's initial acquisition cash

**Evidence:** `11-property-add-modal.png` contains purchase price/date but no explicit initial cash field. `SPEC.md` §4.1 has purchase price and mortgage records; §4.5 already models a down-payment outflow for future purchases; §4.6 starts forward IRR at negative opening equity. There is therefore a genuine distinction to solve, but not a blank slate.

**Recommended concept: “Acquisition funding,” not just one unqualified cash box.**

- Record purchase price, original acquisition loan funding, buyer cash toward the price, separately identified transaction costs, and optionally separately identified initial renovation/furnishing costs.
- Reconcile sources and uses: buyer cash plus acquisition borrowing plus any explicitly supported other funding should cover the included acquisition uses.
- Label initial owner cash clearly: whether it includes transaction costs and initial works must be visible.
- Do not infer original owner cash from the current mortgage balance. A later refinance block is not evidence of original purchase funding.
- For existing properties, show “Historical funding unknown” until supplied. Do not silently backfill purchase cash from current market value or current debt.

**Return implications:** Keep “Forward projected IRR from projection start” separate from any future “Since-purchase realized/projected return.” A purchase cash number alone does not supply historical rent, expenses, renovations, owner contributions, distributions, or refinancing cash. Changing the opening outflow without the matching intervening flows would create misleading performance.

**Interaction with existing behavior:** For future purchases, reconcile the new funding record with the existing acquisition outflow, avoiding double-counting. Clarify whether the current §4.5 “value” used in down payment means purchase price or modeled acquisition-date value; that difference must not be guessed.

**Dependencies:** Persistent fields/events; validation; migration with unknown values; CSV/backup compatibility; Guide/formula definitions; clear date/currency attribution.

**Risks:** Double-counting costs, confusing cash invested with equity, negative or inconsistent funding gaps, treating refinancing as an acquisition, and presenting incomplete history as actual performance.

**Release recommendation:** Clarify existing return labels before release. Add the funding foundation in a focused follow-up unless historical-investment performance is part of your launch promise.

### F2 — Add apartment fields selectively

**Evidence:** Name, address, type, size, garage, purchase date/price, and growth overrides are already visible in `11-property-add-modal.png`. Leases, valuations, mortgages, and holding costs already have separate sections in `20-property-detail.png`. Do not duplicate those records as disconnected property fields.

| Candidate field/group                         | Suggested importance       | Why it is useful                                                                   | Placement / caution                                                                                                                                                                        |
| --------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Acquisition funding and cost breakdown        | High                       | Supports F1 and future invested-cash metrics.                                      | Acquisition section; not all required on first entry.                                                                                                                                      |
| Property country and native currency          | High if F7 proceeds        | Makes aggregation and financial scope explicit.                                    | Core metadata once the currency model is agreed; default existing data to CZK only through an explicit migration rule.                                                                     |
| Notes and data-source reference               | Medium–High                | Records context and provenance without pretending to alter calculations.           | Optional details; avoid collecting unnecessary personal information.                                                                                                                       |
| Structured property category and layout       | Medium                     | Free-text “Type” currently uses bedroom examples, mixing category/layout concepts. | Separate apartment/category from layout only if users need filtering; preserve existing values.                                                                                            |
| Ownership share                               | Conditional High           | Important for part-owned assets.                                                   | Not a harmless text field: decide whether debt, costs, equity, and income are proportionally attributable; borrower liability may differ from ownership. Defer calculations until defined. |
| Parking count/type rather than Garage Yes/No  | Medium                     | Better represents multiple spaces and non-garage parking.                          | Optional metadata first; do not imply separately valued/rented parking without a model.                                                                                                    |
| Initial renovation/furnishing spend           | Medium–High                | Helps explain all-in cost and invested capital.                                    | F1 funding/capital-cost section; distinguish capital spend from recurring maintenance.                                                                                                     |
| Building year, floor, elevator, energy rating | Low–Medium                 | Useful descriptive context for some owners.                                        | Optional Details section; avoid requiring or scoring these without a use case.                                                                                                             |
| Lease status / tenant identifiers             | Low as new property fields | Existing lease dates can already represent part of this context.                   | Prefer derived status from leases; avoid tenant personal-data collection without a clear need.                                                                                             |

**UX recommendation:** Keep a short “Create property” form. Offer optional sections for Acquisition, Details, and Advanced assumptions, with financing/lease entry as a next step. Optional fields should justify themselves through a visible use case.

**Feasibility:** Metadata is likely less involved than calculation-affecting ownership or currencies, but persistence, import/restore compatibility, and migration effort remain unverified.

### F3 — Add an early-repayment section

**Evidence:** `SPEC.md` §10 explicitly lists prepayment at fixation end and annual penalty-free allowances as not modeled. §4.4 defines the existing payment schedule and refinance handover. The supplied mortgage UI has no early-repayment section (`20-property-detail.png`, `22-property-mortgage-add-errors.png`).

**Recommended first scope:** A dated, one-off extra-principal payment associated with a specific loan block; show amount, payment date, fee if entered, and whether the user intends to reduce payment or shorten term. Start with an explicit modeling policy rather than silently assuming lender behavior.

**Display:** Show balance before/after, total cash required including fees, projected interest difference, and the affected payoff date or payment. Separate a planned what-if repayment from a committed record; avoid making an exploratory scenario alter saved portfolio data.

**Dependencies and sequencing:** Define ordering relative to scheduled payments, fixation reset, same-date refinancing, and development draws. Decide whether partial-month interest remains simplified and disclose that. Recompute schedules, snapshot debt, cash flow, IRR, real terms, exports, and backup/import structures consistently.

**Risks:** Applying the same repayment to two blocks, paying more than outstanding principal, double-counting the cash outflow, fees treated as principal, and suggesting legal eligibility for a fee-free repayment without evidence.

**Acceptance cases:** Zero/invalid amount, amount equal to balance, overpayment, repayment on a regular due date, on fixation end, at refinance, before base date, after payoff, and repeated events. Define outcome for each before implementation.

**Priority:** P2. High user value, but do not delay a bounded current-scope release solely to add unverified financial complexity. Automatic statutory allowance/fee calculations should be a later, jurisdiction-specific decision; no such rules have been validated in this review.

### F4 — Replace awkward Save placement with a coherent editing pattern

**Evidence:** A04; `60-settings-assumptions.png`, `21-property-valuation-edit.png`, `20-property-detail.png`.

**Preferred option:** One explicit action row for the Assumptions form, visible at the bottom and kept reachable while scrolling. Include Cancel/revert, Save changes, and state feedback. Use the same pattern for record edits, with a scope label when needed.

| Option                                    | Benefit                                                   | Risk / trade-off                                                                        | Assessment                                              |
| ----------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Sticky form action row                    | Clear commitment and predictable location for long forms. | Can obscure content or conflict with nested scrolling.                                  | Recommended, subject to keyboard/minimum-window checks. |
| Top and bottom actions for the same form  | Easy discovery without new persistence behavior.          | Duplicate visual controls; both must reflect one save state.                            | Acceptable smaller change.                              |
| Separate saves for each independent group | Smaller edit scope.                                       | Users may think all assumptions were saved when only one group was.                     | Use only if independence is explicit.                   |
| Autosave                                  | Less button use.                                          | Half-entered financial values, expensive recalculation, unclear failure/undo semantics. | Not the default for financial inputs before release.    |

Autosave can be appropriate for low-risk preferences such as theme/language, but that does not make it the right pattern for loan or projection assumptions.

### F5 — Add metrics that answer decisions, not more decorative tiles

**Existing metrics:** Net worth, LTV, DSCR, NOI, gross/net yield, annual/monthly-equivalent cash flow, IRR, CAGR, cumulative cash flow, cash-flow-positive year, debt-free year, principal repaid, and weighted rate are already represented in `01-dashboard.png`, `10-properties.png`, and `70-guide.png`; `SPEC.md` §§4.3–4.6 defines them.

**Recommended candidates:**

| Metric / indicator                                               | Importance         | Decision it supports                               | Definition / dependency / caveat                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next fixation/reset date and debt exposed over a selected period | High               | Anticipating payment shocks.                       | Use loan-specific fixation dates; distinguish assumed reset from known successor terms. Existing domain appears relevant, but actual availability is unverified.                                                 |
| Peak projected funding shortfall                                 | High               | Capital required to sustain the modeled portfolio. | Maximum negative cumulative modeled cash position over the chosen horizon, with a clear starting-cash assumption; distinguish acquisition cash from operating shortfall. Annual data can miss within-year peaks. |
| Cash-on-cash return                                              | High after F1      | Income relative to owner cash committed.           | Define annual pre-tax cash flow divided by a clearly scoped invested-cash denominator. Show n/a for unknown/zero denominator; do not substitute current equity.                                                  |
| Break-even rent or occupancy                                     | Medium–High        | Operating resilience.                              | Derive consistently with fixed costs, rent-linked costs, debt service, vacancy, and the modeled period. Not a realized-occupancy measure; exclude tax/capital costs explicitly if not modeled.                   |
| Near-term minimum DSCR                                           | Medium–High        | Detecting weak years hidden by terminal wealth.    | Use matched-period NOI/debt service, identify the period, and handle no-debt cases separately. Annual aggregation can hide shorter shortfalls.                                                                   |
| Valuation age and source status                                  | Medium–High        | Confidence in equity/LTV inputs.                   | Derived from valuation metadata; appreciation does not make an old valuation newly observed.                                                                                                                     |
| Total interest and remaining loan term                           | Medium             | Comparing financing paths and F3 effects.          | Derived from the modeled schedule, subject to resets/refinances and horizon limits.                                                                                                                              |
| All-in cost per m² / purchase-cost yield                         | Medium             | Comparing acquisition economics.                   | Requires consistent cost scope and size; distinguish from market-value cap rate.                                                                                                                                 |
| Since-purchase IRR or dated return                               | Later, conditional | Historical owner performance.                      | Requires complete dated contributions/distributions and terminal basis, not just F1. Do not imply it is already supportable.                                                                                     |

**Recommendation:** Initially expose upcoming reset exposure and funding shortfall as actionable details, not necessarily permanent hero cards. Add cash-on-cash only when the funding denominator is reliable. Correct A01–A03 before layering on new return measures.

### F6 — Overall UI improvements

**Keep:** The restrained palette, visible negative-value treatment, textual health bands, chart table alternatives, and clear empty Dashboard actions. **Evidence:** `01-dashboard.png`, `07-dashboard-chart-table.png`, `80-empty-portfolio.png`.

**Suggested hierarchy:**

1. **Dashboard:** a compact selected-date summary; one prominent cash-flow/risk message; a short horizon summary; deeper charts/KPIs below. Label the two time bases separately.
2. **Properties:** a dependable scan table with bounded names, units, date context, a primary open action, and less prominent destructive actions.
3. **Property detail:** overview plus clearly separated records/financing/projections; advanced loan controls revealed only when relevant.
4. **Settings:** simple navigation and consistent save scope; place F7 settings here, but keep native currency attached to the underlying records.
5. **Scenarios:** meaningful timing and assumptions beside outcomes; show differences from Base and explain crash-denominator effects.
6. **Import/Guide:** compact steps, early format guidance, linked errors, and a searchable or indexed Guide if its length remains similar.

**Visual polish:** Favor tabular numerals for dense comparisons, predictable button hierarchy, readable secondary labels, and stable error layouts. Do not equate smaller text or removing essential labels with a cleaner UI. Charts should retain units and table alternatives; hidden content needs discoverable navigation.

**Priority:** Targeted meaning/overflow fixes before release; broader restructuring afterward. No full rebrand is justified by the supplied screenshots.

### F7 — Multi-currency support in Settings

**Evidence:** `SPEC.md` §1 locks currency to CZK; §10 excludes FX/multi-currency. `CHANGELOG.md` 1.2.0 says the Currency tab was removed. `README.md`, “Security & Privacy,” and `SPEC.md` §8 describe an offline/no-network product. This proposal changes the documented scope and may affect the privacy promise if live rates are introduced.

**First decide which product you want:**

| Model                         | What it actually means                                                                                            | Scope / risk                                                                                                                                  | Assessment                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Single portfolio currency     | Every monetary record uses one chosen currency; no mixing or FX aggregation.                                      | Smaller than true FX, but existing amounts cannot simply be relabeled without informed intent. Currency does not generalize Czech loan rules. | Viable staged capability if clearly named.                          |
| Reporting/display conversion  | Original records remain in their source currency, converted for display using a chosen rate policy.               | Must label rate date, conversion method, and approximation; does not automatically support foreign-currency loan/asset mismatches.            | Useful intermediate option, not “full multi-currency.”              |
| True multi-currency portfolio | Properties, loans, costs, cash flows, and portfolio reports carry explicit currencies and consistent conversions. | Broad model, migration, scenario, and testing implications.                                                                                   | Best long-term match for international holdings; P2 strategic work. |

**Recommended design for true support:**

- Settings holds reporting currency, number/date locale, and the FX policy. It must not be the only place currencies exist.
- Attach native currency to the relevant monetary records. Decide whether a property and its mortgage may differ; if not, enforce that restriction visibly.
- Preserve original amounts when changing reporting currency. Do not overwrite historical amounts through repeated conversions.
- Define conversion for stocks at the as-of date, dated cash flows at an appropriate historical/period rate, and forecast flows under an explicit future-FX assumption. A single current rate may be acceptable as a clearly labeled approximation, not as historical performance.
- Record rate orientation, effective date, and source. Missing rates should yield an incomplete/unavailable total with an explanation, not a silent 1:1 conversion or omission.
- Recompute portfolio ratios from consistently converted numerators and denominators, not averages of property percentages. Do not sum currencies without conversion.
- Decide how “Real” works: reporting-currency purchasing power and CPI versus local-currency purchasing power are different measures. State the order and base date of FX conversion and inflation adjustment.
- Respect currency-specific display precision while keeping adequate internal precision. Locale is independent of currency and language.

**Offline-first recommendation:** Start with explicit user-entered/imported rate assumptions if preserving the current no-network scope. Automatic rates need a separately approved network/provider, update, failure, privacy, and licensing policy; none is implied by this review.

**Dependencies:** Schema migration, safe CZK attribution to existing records, import/backup versioning, money formatting, aggregation, return calculations, scenarios, exports, missing-rate validation, and updated documentation/test examples.

**Critical tests:** Changing reporting currency must preserve native records; switching back must not compound rounding; missing and stale rates must be visible; cross-currency debt must be supported correctly or rejected clearly; real/nominal and scenario results must identify the same economic basis.

**Recommendation:** Decide scope now, but do not add a currency dropdown that merely changes the Kč label. A clearly scoped CZK release can precede true multi-currency without being an inadequate open-source release.

---

## 6. Additional feature candidates

These are **new proposals**, not assertions that the latest app lacks every capability below. Importance reflects product judgment for the stated public audience, not user research or estimated demand. They complement, rather than duplicate, F1–F7.

| Candidate                                                   | Suggested importance | User value / evidence or rationale                                                                                                                         | Dependencies and risks                                                                                                            | Suggested timing                                     |
| ----------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Guided start with an explicit sample-versus-personal choice | High                 | Reduces confusion around the documented first-run sample and existing empty states. See A13; `SPEC.md` §5.                                                 | Must preserve existing data and avoid reseeding after intentional deletion; verify current onboarding first.                      | P2 feature; explain current behavior before release. |
| Data-quality and assumption-provenance panel                | High                 | Helps distinguish observed valuations, inherited defaults, missing records, and projections. The model uses fallbacks and defaults (`SPEC.md` §§4.1, 4.3). | Avoid misleading “complete” scores; state concrete missing/stale inputs and their effects.                                        | P2.                                                  |
| Import dry run with separate additions and updates          | High                 | Reduces unintended overwrites under documented upsert behavior. See A10/D09.                                                                               | Requires accurate match resolution and preview/commit consistency; backup is not a substitute.                                    | P2 feature; disclose overwrite rules now.            |
| Local reminders for fixation and lease dates                | Medium–High          | Makes effective-dated records actionable (`SPEC.md` §§4.1–4.4).                                                                                            | Decide whether in-app notices or OS notifications; handle stale/open-ended records and avoid promises of lender deadlines.        | P2.                                                  |
| Scenario difference summary                                 | Medium–High          | Explains what changed from Base and why outcomes differ; directly supports A03/A09.                                                                        | Requires transparent assumptions and consistent comparison basis; avoid causal explanations not supported by the model.           | P2.                                                  |
| Search, sort, and filter for larger property/scenario lists | Medium–High          | The domain claims 1…N properties, while supplied examples show a small portfolio (`README.md`, “Features”; `10-properties.png`).                           | Larger-portfolio demand and runtime performance unverified; preserve keyboard access and filter context.                          | P2 after representative testing.                     |
| Backup recency and recovery-status indicator                | Medium–High          | Makes local-only data stewardship visible; complements existing export/restore (`64-settings-backup.png`).                                                 | A recent backup is not proof of recoverability; avoid implying automatic off-device protection.                                   | P2.                                                  |
| Property sale/disposal event                                | Medium               | Preserves history and records proceeds instead of treating deactivation as a sale. See A14.                                                                | Sale costs, debt payoff, tax exclusions, timing, and cash-flow integration; more than an archive button.                          | P2/P3 after F1 and financial event design.           |
| Transparent planned capital expenditure                     | Medium               | Lets owners model large nonrecurring repairs separately from percentage maintenance defaults (`SPEC.md` §4.1).                                             | Cash-flow timing, reserve-versus-spend distinction, return effects, and double-counting prevention.                               | P2/P3.                                               |
| Simple actual-versus-plan tracking                          | Conditional Medium   | Useful if the product is intended to become an operational tracker rather than primarily a planning model.                                                 | Requires actual transactions/reconciliation; transaction ledger is currently out of scope (`SPEC.md` §10). Major scope expansion. | P3 unless you change product positioning.            |
| Multiple portfolios/entities                                | Conditional Medium   | Helps owners separate investments without deactivating records to simulate separate portfolios.                                                            | Cross-portfolio transfer, identity, defaults, backup, and aggregation decisions; explicit current non-goal (`SPEC.md` §2).        | P3.                                                  |

**Not recommended for this release merely to appear more complete:** cloud synchronization, accounts, bank connections, a mobile application, or automatic tax advice. These would change the current product scope and risk profile without evidence of an immediate need; several are explicit non-goals in `SPEC.md` §§2, 10.

---

## 7. Prioritized recommendations and sequencing

### 7.1 Before public release

| Order | Work package                                              | Findings              | Expected outcome                                                                                | Nature of work                                                          |
| ----- | --------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1     | Confirm latest financial display and comparison semantics | A01–A03, A09, A15     | Users cannot confuse real/nominal, selected date/base date, or crash recovery/owner loss.       | Reproduce, choose definitions, then fix labels/formulas only as needed. |
| 2     | Reconcile current behavioral documentation                | D01–D03, D06, D08–D09 | One coherent description of IRR, leases, presets, limitations, tolerances, and import behavior. | Documentation plus checks against actual implementation.                |
| 3     | Establish a clear public entry path                       | A13, D04–D07          | Visitors know platform/currency limits, how to run it, how to start, and how to recover.        | Documentation and targeted onboarding clarification.                    |
| 4     | Confirm high-impact layout and accessibility issues       | A05–A06, A11–A12      | Names do not obscure key risk data; controls/tables remain operable and understandable.         | Latest-build verification, then targeted UI changes.                    |
| 5     | Complete data-safety and release checks                   | A10, A14; §8          | Demonstrated backup/restore, upgrade, clean-run, and release-evidence readiness.                | Verification, not an assumed defect list.                               |

**P0 escalation rule:** If verification demonstrates silent mixed-currency sums, material incorrect financial results, destructive partial writes, unrecoverable migration, or inaccessible essential workflows, reassess as a release blocker based on that evidence. This report does not claim those failures have occurred.

### 7.2 First improvement cycle after the focused release

1. Unify Save/Cancel and simplify long property forms (F4/F6).
2. Add acquisition funding with explicit unknown-history states (F1), plus only the highest-value optional fields (F2).
3. Add selected decision metrics supported by trustworthy data (F5).
4. Implement one-off early repayment after agreeing event ordering and policy (F3).
5. Implement the chosen currency scope, with migration and reconciliation checks (F7).

This order is a recommendation, not a mandatory sequence. If non-CZK holdings are essential to the actual first users, elevate the currency architecture decision before introducing new monetary fields. If rapid public sharing is the priority, publish with explicit current limits and keep the financial expansions separate.

### 7.3 Avoid bundling model changes into a cosmetic release

Initial owner cash, prepayment, and FX can all alter return calculations, imports, backups, and documentation. Treat them as separately specified capabilities with migration and regression evidence. UI cleanup can improve usability sooner without forcing those economic decisions.

---

## 8. Release-readiness checks

These checks remain **unverified** unless supported by actual release evidence later. A documented safeguard is a reason to test that safeguard, not a reason to assume it is missing.

| Gate                                    | Required demonstration                                                                                                                                                           | Evidence currently available                                                          | Release implication                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| G1 — Latest-build visual reconciliation | Reproduce A01–A16 as relevant and close items already fixed; identify the tested build.                                                                                          | Earlier screenshots; owner clarification that these are not latest.                   | Do not convert stale observations directly into implementation tickets.                     |
| G2 — Financial reconciliation           | Match snapshots, annual rows, nominal/real KPIs, scenario denominators, exports, and documented formulas; include year-zero and future-date cases.                               | Formulas and sample values; no executed engine tests.                                 | Essential before claiming financial correctness.                                            |
| G3 — Restore and upgrade safety         | Valid backup round trip; corrupt/unsupported backup leaves data unchanged; safety-copy failure aborts; supported migration and documented recovery work.                         | `SPEC.md` §§5, 9; `CHANGELOG.md` 1.2.0; backup screen.                                | Essential for users entrusting real records.                                                |
| G4 — Import integrity                   | Separate add/update outcomes; invalid row/file handling; documented batch atomicity; case/name matching; no unnoticed partial write.                                             | `SPEC.md` §6; import error/success captures.                                          | Essential before recommending bulk import.                                                  |
| G5 — Usability/accessibility            | Complete keyboard-only tasks, accessible names, modal focus, calendar operation, error announcements, table reading, zoom/minimum window, contrast, all themes/languages.        | Narrow keyboard records, visible focus/table states, documented claims.               | Automated scan claims alone are insufficient.                                               |
| G6 — Public repository completeness     | Clean clone/setup/build; exact dependency requirements; valid docs links; included license; sanitized fixtures/screenshots; no private data or credentials in release materials. | README instructions and links; no full repository or clean-build output.              | Required for a credible public repository; no vulnerability audit performed.                |
| G7 — Distribution and support contract  | Declare source-only or available packages; supported hardware/OS; update and data-compatibility policy; support/reporting route; binary checks if distributed.                   | `README.md`, “Prerequisites,” “Quick Start,” “Security & Privacy.”                    | Scope-dependent; packaged binaries are not assumed required.                                |
| G8 — Recovery and failure states        | Startup failure, save failure, export canceled/failed, migration failure, and restore preview are understandable and non-destructive.                                            | Loading screenshot; documented startup/export/restore claims in `CHANGELOG.md` 1.2.0. | Uncaptured states need testing; a loading image cannot establish recovery or startup speed. |
| G9 — Broad-audience expectations        | Supported country/currency conventions, forecast limitations, financial terminology, and first-use steps are obvious.                                                            | Explicit Czech/CZK technical spec and a detailed Guide.                               | Essential if the audience remains “anyone”; does not require internationalizing at launch.  |

**Suggested release posture:** Publish only with claims proportionate to verified evidence. A clearly labeled, limited-scope open-source release is compatible with a longer roadmap. A claim of broad international readiness or verified investment performance is not supported by this evidence set.

---

## 9. Decisions reserved for you

No option below is implemented or considered approved merely because it appears in this report.

| Decision                  | Options / trade-off                                                                                             | Recommended default                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Public positioning        | Broad availability of a Czech/CZK macOS planning tool versus internationally general-purpose product.           | Broad availability, explicit current constraints.                                      |
| Financial release gates   | Hold for all cosmetic improvements versus focus on financial meaning, data safety, and essential accessibility. | Gate on trust and essential use, not every visual preference.                          |
| Initial cash scope        | Record acquisition funding only versus build since-purchase performance with complete history.                  | Funding foundation first; retain clearly labeled forward IRR.                          |
| Crash comparison basis    | Existing-owner loss from a common starting basis versus recovery/return from a shocked starting value.          | Make owner downside the primary comparison; show any rebased return explicitly.        |
| Currency scope            | Single chosen currency, display conversion, or true multi-currency records and aggregation.                     | Decide before new money fields; keep current CZK release if FX is not launch-critical. |
| FX source                 | Manual/offline rates versus automatic network rates.                                                            | Manual/imported assumptions first if preserving offline scope.                         |
| Real-terms basis under FX | Reporting-currency purchasing power versus local purchasing power.                                              | One clearly documented reporting basis, not an implicit mixture.                       |
| Early-repayment policy    | Reduce instalment, shorten term, or support both; actual versus planned events.                                 | Explicit choice and one-off events first; no automatic legal fee assumptions.          |
| Editing model             | Explicit saves versus autosave; page versus section scope.                                                      | Explicit form-scoped Save/Cancel for financial data.                                   |
| Apartment-field breadth   | Minimal creation with optional details versus a large all-in-one form.                                          | Minimal creation, progressively disclosed optional groups.                             |
| New metrics               | More headline tiles versus decision-specific detail.                                                            | Fix meanings first; prioritize reset exposure, funding shortfall, then cash-on-cash.   |
| Additional roadmap        | Onboarding/data quality/import safety versus operational ledger/cloud expansion.                                | Keep the next cycle close to the existing local planning product.                      |

**Approval boundary:** Validating these recommendations would establish priorities and requirements only. Implementing code, changing repository documentation, or modifying the application requires a separate explicit request.

---

## 10. Review completeness and evidence register

### 10.1 Evidence inventory

All names below are the supplied filenames. References in findings point to these screenshots or named document sections; screenshots are not assumed to be independent proof of runtime behavior.

| Evidence group                     | Exact files                                                                                                                                                                                 | Coverage                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                            | `00-loading.png`                                                                                                                                                                            | Loading copy/layout; no timing or recovery inference.                                                                                       |
| Dashboard and lenses               | `01-dashboard.png`; `02-dashboard-real.png`; `03-dashboard-asof-5y.png`; `04-dashboard-calendar.png`; `05-dashboard-filter.png`; `06-sidebar-collapsed.png`; `07-dashboard-chart-table.png` | Financial labels, dates, filters, navigation, charts, table alternatives.                                                                   |
| Property list and creation         | `10-properties.png`; `11-property-add-modal.png`; `12-property-add-errors.png`; `13-property-delete-confirm.png`; `14-properties-long-name.png`                                             | List density, fields, validation, deletion consequences, long-name layout.                                                                  |
| Property detail                    | `20-property-detail.png`; `21-property-valuation-edit.png`; `22-property-mortgage-add-errors.png`; `23-property-deactivate-confirm.png`; `24-property-record-leave-guard.png`               | Records, loan complexity, editing, deactivation, unsaved changes, schedules.                                                                |
| Projections                        | `30-projections.png`; `31-projections-real.png`                                                                                                                                             | Period labels, units, real/nominal context, visible overflow, export discoverability.                                                       |
| Scenarios                          | `40-scenarios.png`; `41-scenario-form.png`; `42-scenarios-compare.png`                                                                                                                      | Presets, form semantics, comparison basis, financial interpretation.                                                                        |
| Import                             | `50-import.png`; `51-import-errors.png`; `52-import-done.png`                                                                                                                               | Templates, errors, blocked action, completion report, upsert clarity.                                                                       |
| Settings                           | `60-settings-assumptions.png`; `61-settings-assumptions-error.png`; `62-settings-assumptions-bounds.png`; `64-settings-backup.png`                                                          | Save scope, validation, ranges, backups and restore wording.                                                                                |
| About and Guide                    | `65-about.png`; `70-guide.png`                                                                                                                                                              | Product identity, user explanations, documented model meanings. About-version discrepancy intentionally excluded after owner clarification. |
| Empty states                       | `80-empty-portfolio.png`; `80-empty-properties.png`                                                                                                                                         | Initial actions and consistency; not proof of first-run behavior.                                                                           |
| Keyboard captures                  | `90-keyboard-focus-tab1.png`; `90-keyboard-focus-tab8.png`; `90-keyboard-focus-tab12.png`; `90-keyboard-focus-tab20.png`; `90-keyboard-focus-order.json`; `90-keyboard-property-row.json`   | Limited focus order/appearance evidence, with activation and accessibility-tree limitations.                                                |
| Public-facing repository documents | `README.md`; `SPEC.md`; `CHANGELOG.md`                                                                                                                                                      | Substantive review with section-level references throughout.                                                                                |
| Contributor-instruction document   | `CLAUDE.md`                                                                                                                                                                                 | Presence/readability only; no substantive content assessment included.                                                                      |

### 10.2 Numerical checks performed

The following are calculations from displayed values, not an execution of the app's financial engine:

- Opening equity **22,605,406 Kč**: `07-dashboard-chart-table.png`, Y0 Equity; also `30-projections.png`, opening row.
- Nominal terminal equity **109,628,836 Kč**: `01-dashboard.png`, “Key performance indicators.” Dividing by opening equity gives **4.8497×**.
- Real terminal equity **52,263,792 Kč**: `02-dashboard-real.png`, “Key performance indicators.” Dividing by opening equity gives **2.3120×**.
- Dividing nominal terminal equity by the selected-date equity in `01-dashboard.png` (**23,030,258 Kč**) gives **4.7602×**; using `03-dashboard-asof-5y.png` (**31,887,535 Kč**) gives **3.4380×**. These are diagnostics for the “today” denominator label, not proposed replacement formulas for all views.
- Illustrative crash opening equity uses `30-projections.png` opening assets **33,800,000 Kč** and debt **11,194,594 Kč**: assets after a 20% haircut minus debt equals **15,845,406 Kč**. Dividing the rounded **87.7 M Kč** terminal figure from `42-scenarios-compare.png` by this gives approximately **5.53×**. It does not verify the crash IRR.
- Dashboard annual cash flow **−51,252 Kč** divided by 12 gives **−4,271 Kč**, consistent with the displayed monthly equivalent (`01-dashboard.png`). The three property flows **−93,108**, **175,104**, and **−133,248 Kč** sum to **−51,252 Kč** (`10-properties.png`). These checks support internal consistency of those displayed figures, not comprehensive financial correctness.

### 10.3 Completion and quality check

- All seven requested improvement areas are assessed with value, evidence, dependencies, risks, conditional feasibility, and priority.
- Additional ideas are separate, importance-ranked proposals, not invented user requirements.
- Application and repository findings are separately grouped and traceable.
- Existing safeguards and metrics are recognized rather than recommended as wholly missing.
- Screenshot age is reflected throughout; the About-version issue is not used as a release finding.
- Missing linked materials and unverified runtime behavior are explicitly identified.
- The substantive-document review limitation for `CLAUDE.md` is disclosed rather than hidden.
- Calculated diagnostics were checked from the cited displayed values.
- No independent reviewer was used, in line with the revised approved plan.
- No code, application settings, or repository documentation was modified. The next step is owner validation of priorities and trade-offs, not automatic implementation.
