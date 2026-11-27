# 0278. Code-only rules in the three current-rule records

- Status: Accepted
- Date: 2026-11-27
- Source: issue #498; the "Discrepancies for the owner" sections of PR #717 (ADR 0273),
  PR #718 (ADR 0274) and PR #719 (ADR 0275); owner decision 2026-11-27, in session: accept the
  three records as written, let today's code be the rule on every listed discrepancy, and
  fix the stale text separately
- Amends: [0273](0273-prepayments-and-recasts-current-rule.md) (decisions 1 to 9),
  [0274](0274-sections-current-rule.md) (decisions 10 to 16),
  [0275](0275-data-check-current-rule.md) (decisions 17 to 23)
- Related: [0272](0272-current-rule-likelihood-ui-rounds.md) (current-rule records)
- Topic: Records: code-only rules
- Trigger: n/a (records today's behaviour; adds no handling)
- Likelihood: n/a (adds no handling)

## Context

ADRs 0273, 0274 and 0275 restate three long chains as current-rule records (ADR 0272 §1).
While writing them, each PR listed the places where the code does something no accepted
record states, or states differently. The records kept the ADR wording and decided none of
them.

On 2026-11-27 the owner accepted the three records as written and decided "code wins" on
every listed discrepancy: today's behaviour becomes the rule, and nothing changes. This
record writes those rules down, one decision each, and says which record section it
completes. Each decision was checked against the code at `origin/main` (the merge of #719).

Left out:

- Stale text: the header comment of `src/engine/loan/pay.ts`, the doc comment of
  `propertySections`, the constant and issue-code names in ADRs 0109 and 0138, the
  range-check names in ADR 0236, and a test title in `dataCheck.test.ts`. A separate
  refactor fixes these; none is a rule.
- What later records already settle: the effect of the period's last applied prepayment
  (ADR 0179 §3, in 0273 §3.1), a pending property's stored-value findings (0275 §5.2) and the
  missing base-date portfolio row (0275 §3.4).
- Item 6 of #718 (the Nominal / Real switch with invalid data): ADR 0265 and the code agree,
  and 0274 §3.3 states it.
- The interest-saved display reading the unrounded value, already open in #327
  (ADR 0178).

## Decision

### Prepayments and recasts (completes ADR 0273)

1. **The event window after an instalment recast** (0273 §7.3). Any instalment-form recast
   moves the last date an event may have to the cap of 0273 §4.6 (the later of loan start +
   50 years and the contract term), wherever the agreed instalment would actually end the
   loan. A maturity-form recast moves it to that maturity. An event dated on or after that
   payment is `EVENT_AFTER_SCHEDULE_END`. Code: `eventTermMonths`
   (`src/engine/loanTerm.ts:116-131`), used by `checkLoanEvents`
   (`src/engine/validate/loanEvents.ts:123-134`). Test:
   `loan-events-validation.test.ts:261` ("an instalment recast lets events run to the
   50-year cap").
2. **Several recasts in one payment period** (0273 §2.2, §4). They apply in date order,
   each on the terms the one before left and on the balance plus the tranches it sees. The
   last one that sets new terms decides; one that is ignored (for example below the
   interest) leaves the terms as they were. Each is reported on its own. Code: `byDate`
   (`src/engine/loan/events.ts:127-129`) and `applyRecasts` (`events.ts:332-362`).
3. **A recast instalment equal to the interest** (0273 §4.3). An instalment that does not
   exceed the interest of payment `q` is ignored and reported as
   `RECAST_INSTALMENT_BELOW_INTEREST`, so one exactly equal to it is ignored too. Code:
   `recastTerms` (`events.ts:312`, `lessThanOrEqualTo`).
4. **An instalment recast on the completion date** (0273 §4.7). "Before completion"
   includes the completion date itself: an instalment-form recast dated on or before a
   development loan's completion date is `RECAST_INSTALMENT_BEFORE_COMPLETION`. This
   matches interest-only lasting through the completion date (ADR 0129 §2). Code:
   `checkRecastInstalment` (`validate/loanEvents.ts:102`, `isOnOrBefore`). Tests:
   `loan-events-validation.test.ts:233-235` (a recast on the completion date, 2027-08-20, is
   refused) and `:282` (the day after is allowed).
5. **The snapshot instalment at a handover** (0273 §12.2). The snapshot takes the next
   row's instalment only when that row is at the same rate, draws nothing and has no
   refinance difference. A handover row therefore keeps the month's own instalment. Code:
   `instalmentAtMonth` (`src/engine/loan/queries.ts:42-49`).
6. **"Amortizing" in the snapshot means principal above zero** (0273 §12.2). The snapshot
   looks at the next row only when the month's row repaid principal (`row.principal > 0`).
   An amortizing month that repays none (payment `q` under the interest floor of 0273 §4.4,
   or a stored loan whose instalment does not exceed its interest, ADR 0264) keeps the
   month's own instalment, as an interest-only month does. Code: `queries.ts:45`.
7. **A recast after payoff** (0273 §6.1). A recast whose balance (plus the tranches it
   sees) is zero sets nothing and is reported as `RECAST_AFTER_PAYOFF`. This is now a
   decided rule, not only a described check. Code: `applyRecasts` (`events.ts:344-347`).
   Test: `loan-events.test.ts:380` ("a recast after payoff is reported").
8. **A recast in the handover period** (0273 §9.3). A recast that settles in a payment
   period the successor replaces is reported as `RECAST_REPLACED`, with no month, even when
   it is dated on or before the successor's start. This is now a decided rule. Code:
   `handoverPrepayments` (`src/engine/loan/chain.ts:162-176`). Test:
   `loan-events.test.ts:852` (a recast dated on the successor's start).
9. **A tranche on the maturity payment** (0273 §5.3). A tranche landing on or after the
   payment of the maturity in force sets the maturity to the later of the maturity in force
   and the contract term. This is the contract term in every case that can be entered: they
   differ only for a tranche after the contract term, which ADR 0226 §1 refuses. Code:
   `termsForTranche` (`events.ts:87-98`).

### Section navigation (completes ADR 0274)

10. **The Acquisition section is in the section nav** (0274 §2.1). It is listed, after
    Financing, whenever the engine has output (the same condition as the Overview), labelled
    `propertyDetail.sectionAcquisition`. Code: `propertySections`
    (`src/ui/model/sectionNav.ts:26`), label `src/ui/model/propertyDetailView.ts:136`. Test:
    `sectionNav.test.ts:27`.
11. **The section links are links, not tabs** (0274 §1.1). Each is an `<a>` with
    `aria-current="location"` on the current one. Where ADR 0215 says "section tabs", it
    means these links; only Settings has real tabs in that row (ADR 0221). Code:
    `src/ui/components/SectionNav.tsx:109-119`.
12. **Which section is current** (0274 §1.3). The current section is the first one, in page
    order, inside a band from under the top bar to the middle of the window; else the one
    marked before; else the first. Once the page is scrolled to the bottom the last one is
    current. A page that does not scroll is never at the bottom, so the first stays. Code:
    `pickCurrent` (`sectionNav.ts:42-55`) and `useSectionSpy`
    (`src/ui/hooks/useSectionSpy.ts:5-11, 31, 37-47`). Tests: `sectionNav.test.ts:85-108`,
    `useSectionSpy.test.tsx:87-110`.
13. **The amortization section needs a schedule row** (0274 §2.2). The Amortization section,
    its nav link and its panel are there only when the property's schedule has at least one
    row. Code: `detailSections` (`propertyDetailView.ts:125`), the body view
    (`propertyDetailView.ts:213-216`) and `PropertyDetailBody.tsx:126`.
14. **The heading a section link focuses** (0274 §1.2). A link moves focus to the first `h2`
    or `h3` inside the section (the Overview's screen-reader heading, or the panel title).
    Code: `focusSection` (`src/ui/focus.ts:35-41`).
15. **The panel head shows months** (0274 §4.1). Where 0274 §4.1 and ADR 0107 §4 say
    "payment count", the head shows `propertyDetail.amortizationMonths`, the number of
    schedule rows. The toggle's `propertyDetail.showAmortization` count is the same number.
    Code: `PropertyAmortizationPanel.tsx:26, 31, 42`; `propertyDetailView.ts:215`.
16. **A clicked link is current at once** (0274 §1.3). After a jump the clicked link is
    marked current straight away, before the scroll band picks a section. Code:
    `SectionNav.tsx:82-86` (`onSelect` after `focusSection`), wired to the setter of
    `useSectionSpy` (`useSectionSpy.ts:8-9, 55`). Test: `useSectionSpy.test.tsx:112`
    ("marks a selected section at once").

### Data check (completes ADR 0275)

17. **`loanWarnings` is a UI-model function** (0275 §1.2). Among the checks the Data check
    calls, "the loan warnings" are `loanWarnings` in `src/ui/model/propertyDetail.ts:94`,
    not an engine selector; it reads the engine's outputs.
18. **The range check is `rangeProblems` in `src/lib/rules.ts`** (0275 §1.2, §3.1). It is a
    shared lib rule, not an engine rule (`rules.ts:80-84`, `:113`), and the Data check reads
    it for a property (`src/ui/model/dataCheck.ts:204`) and for the portfolio rows
    (`dataCheck.ts:254`).
19. **The title pill is a manual open** (0275 §6.6). On the Dashboard a click on the pill
    sets the session's Show / Hide choice to open (`setDataCheckOpen(true)`), so the panel
    then stays open while it has any finding, defaults included, until the owner hides it.
    Code: `src/ui/pages/Dashboard.tsx:119-124`, `src/state/ui/viewState.ts:25-28`,
    `src/ui/pages/DashboardDataCheck.tsx:113`.
20. **Holding costs: the first row wins** (0275 §4.2). The defaults finding reads only the
    property's first holding-cost row, as the engine does. Code: `dataCheck.ts:193`,
    `:273-288`. Test: `dataCheck.test.ts:402` ("the first holding-cost row wins, as in the
    engine").
21. **Fix-link labels on Property detail** (0275 §6.5). ADR 0223 §3's "'Go to …' link" means
    the three labels 0275 §6.5 gives: `dataCheck.goTo` with the section's name for a
    section, `properties.editProperty` for the property form (growth, size) and
    `dataCheck.recordFunding` for own cash. Code: `fixLabel`
    (`src/ui/model/dataCheckText.ts:200-213`).
22. **Out-of-range fixation and term cover every stored block** (0275 §3.1). The range
    finding checks all of the property's mortgage blocks, replaced past blocks included, as
    the instalment finding does (ADR 0264 §4). Code: `dataCheck.ts:143-144`, `:199-216`.
23. **A portfolio chip has no description** (0275 §7.3). On the Dashboard a portfolio row's
    chip (the horizon) has no `aria-describedby`, because its text already names its
    destination; a property chip keeps its description. Code:
    `DashboardDataCheck.tsx:63-66`.

## Consequences

- No code, test, layout, dictionary entry, parity target or golden-master value changes.
- Where 0273 §6.1 and §9.3 say "no record decides this", decisions 7 and 8 now do.
- A change to any of these rules amends the current-rule record it completes, with an
  accepted ADR and a failing test first (ADR 0001, ADR 0272 §1).
