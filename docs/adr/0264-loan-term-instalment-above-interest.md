# 0264. A loan with a term must pay more than its first month's interest

- Status: Accepted
- Date: 2026-11-26
- Source: issue #597 (found reviewing PR #596, #477 item 9; code review 2026-11, tracking
  #435); owner decisions 2026-11-25 on #597: (1) "Option A, refuse", (2) "existing stored
  loans and old backups that break the rule still load and project as today. The Data check
  flags them … Only new entries, edits and CSV import are refused"; owner 2026-11-25 (#597
  body): the kernel clamp itself stays; draft on #597 (night run 2026-11-26), approved by
  the owner on #597 on 2026-11-26 with answers to its six questions (see "Owner decisions")
- Amends: [0017](0017-reject-invalid-loan-inputs.md) (the instalment rule now also covers a
  loan with an explicit term, but as a write-time rule only: restore and the engine do not
  refuse it), [0118](0118-data-check.md) (a new "Needs attention" finding)
- Related: [0163](0163-leases-never-overlap.md) (the write-time-rule pattern followed here),
  [0148](0148-restore-rules-vs-stored-data.md) (stored values the forms no longer accept),
  [0137](0137-agreed-instalment-pays-interest.md) (the other place the clamp could bite),
  [0235](0235-opening-balance-replayed.md) (the replayed opening balance),
  [0251](0251-one-error-per-non-finite-field.md) (one error per field),
  [0141](0141-form-errors-stay-in-form.md) (a refused save shows the rule in the form),
  [0152](0152-wording-log-and-generated-index.md) (new copy)

## Context

A plain loan whose term comes from its instalment (no `loanTermYears`) is refused when the
instalment is at or below the first month's interest (D-17, DR-014):
`derivedTermProblem` returns `INSTALMENT_BELOW_INTEREST` (`src/engine/loanTerm.ts:41-46`).
The same function returns nothing as soon as a term is set (`src/engine/loanTerm.ts:31`).
No other check compares the instalment with the interest: `checkMortgage` only adds the sign
check `isNegativeAmount` on `monthlyInstalment` (`src/engine/validate/loan.ts:113-116`,
`118-131`). So a loan **with** a term and an instalment at or below its interest passes
`validateInputs`, the store, the mortgage form, the CSV import and restore.

The schedule then runs it. `splitPayment` clamps a negative principal to 0
(`src/engine/loan/kernel.ts:24-25`). The balance stays flat, and the month's interest is
shown in the interest column but is neither paid (the instalment is less) nor added to the
balance. The difference disappears from the projection. This lasts until the first payment
at a reset rate, where the engine re-amortizes the balance over the remaining term and the
clamp stops (`recomputeInstalment`, `src/engine/loan/kernel.ts:34-42`).

#597 example, pinned as today's behaviour in `src/engine/__tests__/principal-clamp.test.ts:77-124`:
3,000,000 Kč at 5 %, a 3-year fixation, a 30-year term, instalment 1,000 Kč. The first
month's interest is 3,000,000 × 0.05 ÷ 12 = 12,500 Kč. All 36 fixed-rate payments show
instalment 1,000, interest 12,500, principal 0 and balance 3,000,000 (32 rows in the #596
probe, whose base date was later). 11,500 Kč a month, 414,000 Kč over the fixation, is
neither paid nor owed. Payment 37 re-amortizes at the 4.5 % reset rate to 16,011.61 Kč.
The cash flow is too high by the missing interest, and the debt is too low by the interest
that should have been capitalised. For a block that started before the base date, the
replayed opening balance (ADR 0235, SPEC §4.2 "at or below the month's interest it opens at
the principal", `SPEC.md:214-216`) hides the same gap in the opening debt.

What signals it today:

- Property detail's loan warning `underpays` fires, because `amortizationHealth` asks for
  an instalment above the first interest (`src/engine/loanChecks.ts:42-45`,
  `src/ui/model/propertyDetail.ts:105-113`; text `propertyDetail.amortizationWarn`,
  `propertyDetail.amortizationWarnExpected`).
- The Data check does **not** list it: of the loan warnings it takes only `fixationEnded`
  (`src/ui/model/dataCheck.ts:180-181`).
- `docs/csv-import.md:126-127` already says "The instalment must be more than the first
  month's interest", with no exception for a given term. The code does not match the doc.

How likely, for a Czech mortgage holder:

- **A typo in the instalment** on a loan entered with its term (a dropped digit: 1,250
  instead of 12,500; the instalment of a different loan; a figure in thousands). Plausible:
  this is the realistic trigger. The form's "Calc" fill and hint (`src/ui/model/mortgageForm.ts:147-183`)
  make it less likely in the form than in a hand-written `mortgages.csv`.
- **A real contract with an instalment at or below the interest.** Very rare. Czech
  mortgages are annuities; an interest-only period exists in practice only during
  construction or a staged draw, which the app models as a development loan, whose entered
  instalment is not used (`src/engine/loanInstalment.ts:34-46`, `src/engine/types.ts:166-172`).
  Negative amortization is not offered on Czech consumer mortgages.
- **A stored loan or backup that already holds one.** Possible but rare: it needs a loan
  saved or imported with a term and a wrong instalment before this change. The owner's own
  database cannot be checked here (CLAUDE.md §8); the Data check finding will show it.

The sample portfolio (`src/engine/__tests__/support/seed.ts:71-98`, the same rows in
`src/data/seed.ts:111-132`) has no such loan. None of its three loans has a term, and each
instalment is far above the first interest:

| Loan     | First interest (principal × rate ÷ 12) | Instalment |
| -------- | -------------------------------------- | ---------- |
| Javorova | 1,912,500 × 1.69 % ÷ 12 = 2,693.44     | 6,721.80   |
| Lipova   | 5,610,000 × 3.59 % ÷ 12 = 16,783.25    | 25,567.15  |
| Dubova   | 3,034,500 × 4.49 % ÷ 12 = 11,354.09    | 21,576.40  |

The fixture sweep in `principal-clamp.test.ts:39-75` (seed, mixed, refinance, events and
random generated loans) already asserts that no row pays less than its interest.

## Decision

### 1. The rule and its condition

A **plain** loan block (not `isDevLoan`, `src/engine/loanBlock.ts:15-17`) **with** an
explicit `loanTermYears` is refused when its entered `monthlyInstalment` is **at or below its
first month's interest**: `initialPrincipal × interestRatePa ÷ 12`, the block's own stored
principal and its own entered rate. This is the D-17 test of `derivedTermProblem`
(`src/engine/loanTerm.ts:41-46`), applied with a term. It is reported as the existing
`INSTALMENT_BELOW_INTEREST` code on `monthlyInstalment` (owner decision 1). At 0 % the first
interest is 0, and an instalment of 0 is reported as the existing `ZERO_RATE_ZERO_INSTALMENT`,
again as D-17 does (`src/engine/loanTerm.ts:36-39`; owner decision 2026-11-26, Q2).

One predicate serves both cases. `derivedTermProblem` keeps its early return for a term
and its dev-loan check. Its instalment part moves into a shared function (working name
`instalmentProblem(block)`). `derivedTermProblem` calls it for a loan without a term, and
the write-time rule in §2 calls it for a loan with one. The no-term behaviour does not
change.

Why the first month at the block's own rate is enough:

- **Within the block's agreed period.** If the instalment is above the first interest, the
  first payment repays some principal, so the balance falls. At a fixed rate the interest
  then falls each month and the instalment stays above it. A prepayment only lowers the
  balance. So no later month of the fixation can reach the clamp. The random sweep at
  `principal-clamp.test.ts:54-74` shows this for instalments at or above the annuity; a new
  property test (Consequences, test 2) covers every instalment the rule lets through.
- **At each fixation reset and after a rate shock.** The engine does not keep the entered
  instalment. It re-amortizes the balance over the remaining term (`recomputeInstalment`,
  `kernel.ts:34-42`), and an annuity always pays more than its interest. Scenario rate
  shocks apply to reset rates, so they are covered too. No check per fixation period is
  needed, and the rule needs no assumption (reset rate, shock) as input.
- **A refinance block** (a successor) is its own `MortgageBlock` with its own stored
  principal, rate and instalment. The chain builds its schedule from its own
  `initialPrincipal` (`blockSchedule(next, …)`, `src/engine/loan/chain.ts:105`), so the
  same test on that block, at its own rate, is exact. Each block of a chain is checked on
  its own.
- **An instalment recast** has its own check against the interest the next payment sees
  (`RECAST_INSTALMENT_BELOW_INTEREST`, `src/engine/loan/events.ts:313`; ADR 0137), and a
  tranche on that payment is floored by ADR 0137. Neither changes here.

Edge cases:

| Case                                                                              | Outcome                                                                                                                                                                                                                                                        | How likely (Czech mortgage)                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Instalment below the first interest (#597)                                        | Refused, `INSTALMENT_BELOW_INTEREST`                                                                                                                                                                                                                           | Plausible as a typo; very rare as a real contract                                                 |
| Instalment **exactly equal** to the first interest (12,500 Kč in the example)     | Refused, as in D-17 ("at or below", `lessThanOrEqualTo`, `loanTerm.ts:44`; owner wording on #597). Nothing vanishes in that case, since the interest is paid, but the loan repays nothing until the reset, an interest-only plain loan the app does not model. | Rare: someone enters the interest-only figure from a construction-phase statement on a plain loan |
| Instalment 1 haléř above the interest                                             | Accepted. The balance falls slowly, the reset re-amortizes, and the `underpays` warning stays.                                                                                                                                                                 | Very rare                                                                                         |
| Development loan (draws or `completionDate`, i.e. interest-only until completion) | Not checked. The schedule derives its instalment from the term (D-31) and ignores the entered one, so the entered figure cannot make money vanish.                                                                                                             | Common for new builds; the rule must not touch it                                                 |
| 0 % loan with a term and instalment 0                                             | Refused, `ZERO_RATE_ZERO_INSTALMENT` (owner, Q2)                                                                                                                                                                                                               | Rare: a family or employer loan with deferred repayment                                           |
| 0 % loan with a term and instalment > 0                                           | Accepted                                                                                                                                                                                                                                                       | Rare but valid                                                                                    |
| Principal 0, rate > 0, instalment 0, term set                                     | Refused, as D-17 refuses it without a term (0 ≤ 0)                                                                                                                                                                                                             | Practically never                                                                                 |
| Successor block whose own instalment is at or below its own first interest        | Refused on that block only                                                                                                                                                                                                                                     | Very rare: a bank sets the new instalment as an annuity                                           |
| Rate rises at the reset above what the old instalment covers                      | Not this rule's case: the engine re-amortizes at the reset                                                                                                                                                                                                     | Common, and already handled                                                                       |
| A floating (0-year fixation) block                                                | Same rule. Its entered rate applies until baseDate or its later start (`src/engine/loanRate.ts:13-16`), so only the replayed past months could clamp.                                                                                                          | Rare in Czechia                                                                                   |

Guard, so that one field gets one error (ADR 0251): the rule is checked only when the block
has no other problem on `initialPrincipal`, `interestRatePa`, `monthlyInstalment` or
`loanTermYears` (a non-finite or negative value, a rate out of range, an `INVALID_TERM`).
When one of those is reported, that error comes first, and the instalment rule shows on the
next save once it is fixed.

### 2. Which layer refuses: a write-time rule, as `LEASE_OVERLAP`

The rule is **not** added to `blockIssues` (`src/engine/validate/loan.ts:137-143`). Three
paths share that function: `validatePortfolio`/`validateInputs` through `checkMortgages`
(`src/engine/validate/rows.ts:94-103`), which restore uses (`src/state/restoreRules.ts:14-27`),
and the engine's own gate `assertLoanInputs` (`loan.ts:163-165`, called by
`src/engine/loan/chain.ts:36`, `src/engine/loan/opening.ts:144` and
`src/engine/loan/committedDebt.ts:43`). If the rule were added there, restore would refuse
such a backup and the engine would throw for a stored loan. That breaks owner decision 2.

Instead it follows ADR 0163 §4 exactly. A new engine function, working name
`instalmentBelowInterestErrors(portfolio)`, sits next to `leaseOverlapErrors`
(`src/engine/validate/rows.ts:172-187`) and is exported the same way
(`src/engine/validate/index.ts:15`, `src/engine/index.ts:100`). It returns
`INSTALMENT_BELOW_INTEREST` (or `ZERO_RATE_ZERO_INSTALMENT`) on `monthlyInstalment` for each
block that fails §1. Two callers apply it, filtered to the rows they write:

- **The store, which covers the mortgage form.** The form does no rule check of its own: it
  builds the block (`mortgageFromForm`, `src/ui/model/mortgageForm.ts:211-237`) and leaves
  the rules to the store ("the loan rules themselves are the engine's, checked by the store
  before a save", `mortgageForm.ts:1-2`). `addMortgageBlock` and `saveMortgageBlock` go
  through `writeRow` → `checkEdit` (`src/state/portfolio/entityActions.ts:30-45`, `137-144`).
  `assertRows` (`src/state/portfolio/rules.ts:44-58`) adds the new errors next to
  `leaseOverlapErrors`, filtered with `of(ids)`. So the refused save shows the rule in the
  form, on the instalment field (ADR 0141), as the no-term rule already does, and nothing is
  written.
- **The CSV import.** `checkMerged` (`src/import/plan.ts:543-567`) adds the new errors next
  to `leaseOverlapErrors(merged)` (`plan.ts:566`). They go through the same
  `this.origin` filter, so only blocks this import writes are reported, as an `inputRule`
  problem on the `monthly_instalment` column, and the import writes nothing.

`src/lib/rules.ts` (the form and CSV bound ranges, ADR 0086) is not the place for it: it
holds whole-number bounds, not engine rules. There is no `src/import/inputRules` module. The
shared rule path for form and CSV is the engine's validate layer, called by
`src/state/portfolio/rules.ts` and `src/import/plan.ts`.

What this means for a stored offending loan (owner decision 2):

- It never blocks a write of another row. The store filters by `ids` and the CSV import by
  `origin`, so adding a valuation, a lease, a successor block or another property, or
  editing the property, still works.
- Saving **that** block again (any field, or a prepayment or recast on it, which are saved
  with the block) is refused until its instalment passes. Deleting it is allowed
  (`removeRow` runs no rule, `entityActions.ts:48-53`).
- A CSV row that updates it with the same bad instalment is refused, like a new one.

`src/engine/validate/codes.ts:147-149` says "a code with no gate is raised on its own path".
`INSTALMENT_BELOW_INTEREST` keeps its `"loan"` gate (`codes.ts:159`) for the no-term case
and gains a write-time path. The comment is updated to say so. No new validation code is
added.

### 3. The engine does not refuse it; the clamp stays

- `validateInputs`, `validatePortfolio`, `assertLoanInputs` and `termMonths` do not change.
  A stored loan with a term and a low instalment loads, and the Dashboard, Property detail,
  charts, exports and compare project it **exactly as today** (owner decision 2).
- `splitPayment`'s clamp stays (owner, 2026-11-25). It is the only behaviour that keeps
  stored data's numbers unchanged. The rows stay known-wrong for such legacy data: the
  interest is reported but neither paid nor capitalised until the reset.
- This is recorded as **known-wrong debt**. `principal-clamp.test.ts:77-124` keeps its
  assertions unchanged, and its comment cites ADR 0264 and the debt ID: #611, "Legacy loan
  below the interest projects with vanished interest" (owner, Q4), so #597 closes when this
  ADR ships. `docs/model-limitations.md`,
  under Mortgages, gets one bullet saying such a stored loan keeps its old figures and that
  the Data check lists it.

### 4. The Data check finding

- **Kind:** `instalmentBelowInterest`, a new member of `DataFinding`
  (`src/ui/model/dataCheck.ts:51-91`). It carries the block's start date (`loanStart`), its
  entered instalment and its first month's interest. The interest comes from the engine
  (the same `instalmentProblem` or a small exported helper next to it), never from maths in
  the UI (CLAUDE.md §4).
- **Severity:** "Needs attention" (the `attention` list), so it counts in the review pill
  (`reviewPill`, `dataCheck.ts:116-124`) on the Dashboard and Property detail.
- **When:** it is a stored value, so it is listed at any as-of date, like `outOfRange` and
  `leaseOverlap` (the `stored` array, `dataCheck.ts:137-141`). It is listed for every stored
  block of the property that fails §1, replaced past blocks included, not only from the
  block in force onward (owner, Q3). An inactive property is left out of the Dashboard as usual
  (`dataCheck.ts:295-300`).
- **Fix link:** `financing` (`findingFix`, `dataCheck.ts:397-421`).
- **Grouping:** its sentence holds per-loan values, so it uses the default
  `findingLine` branch (its own sentence, no chip detail), as `leaseOverlap` does.
- **Wording:** one new key, `dataCheck.instalmentBelowInterest` (en/cs/ru), taking the
  loan's start date, the instalment and the first interest. The en text is approved by the
  owner verbatim (Q6); cs and ru carry the same meaning and are listed in the PR for the
  owner's review. The new key is recorded in `docs/decisions/wording.md` (ADR 0152). The Data check list is
  `role="list"`, not a live region (`src/ui/components/DataCheckBlocks.tsx:126`).
- **Refusals reuse existing copy:** `inputRules.INSTALMENT_BELOW_INTEREST` and
  `inputRules.ZERO_RATE_ZERO_INSTALMENT` (`src/i18n/en.ts:116-119` and cs/ru), unchanged
  (owner, Q5): no new refusal key.
- Property detail's `underpays` loan warning stays as it is (owner, Q3).

### 5. Restore

A backup holding such a loan **restores** as before. `checkInputRules`
(`src/state/restoreRules.ts:14-27`) calls `validateInputs`/`validatePortfolio`, which do not
gain the rule, so it adds no issue and asks nothing. After the restore the loan projects as
today and the Data check lists it (§4), as ADR 0163 §4–5 does for a stored lease overlap. The
confirm step does not warn about it (owner, Q1).

## Consequences

- **User-visible.**
  - The mortgage form refuses to add or save a plain loan with a term whose instalment is at
    or below its first interest. The message is `inputRules.INSTALMENT_BELOW_INTEREST`, on
    the instalment field.
  - A `mortgages.csv` row like that is refused and the import writes nothing.
  - A stored loan like that gets a Data check line (`dataCheck.instalmentBelowInterest`)
    and adds one to the review pill. It cannot be saved again until its instalment is fixed;
    it can be deleted.
  - Restore, load, every figure, every export and the backup format do not change.
- **No migration**, no schema, no stored-data or backup-format change.
- **Parity targets and golden master unchanged.** The engine does not change, and the sample
  portfolio has no such loan (the Context table). No row in the target change log.
- **ux-capture:** the sample screens do not change (no new finding on the sample data).
- **Docs.**
  - SPEC §4.2's rule list (`SPEC.md:140-153`) names the write-time instalment rule next to
    `LEASE_OVERLAP`.
  - SPEC `SPEC.md:214-216` keeps "at or below the month's interest it opens at the principal"
    and adds "(a loan stored before ADR 0264)".
  - `docs/csv-import.md:126-127` already states the rule. Add "also when `loan_term_years`
    is given".
  - `docs/model-limitations.md` gets the legacy bullet (§3).
  - The ADR index is regenerated, with "Amended by: 0264" added to ADR 0017 and 0118.
- **The comment in `codes.ts:143-149`** names the write-time path. The comment at
  `principal-clamp.test.ts:1-8,77-81` cites ADR 0264 and the debt ID #611.

Failing tests to write first. They are new files unless named, and no existing assertion
changes:

1. `src/engine/__tests__/instalment-below-interest-rule.test.ts`, for
   `instalmentBelowInterestErrors`:
   - The #597 loan (3,000,000 Kč, 5 %, 30 years, 1,000 Kč) gives `INSTALMENT_BELOW_INTEREST`
     on `monthlyInstalment`.
   - 12,500 Kč exactly is refused; 12,500.01 Kč is accepted.
   - A development loan with any entered instalment, and one with draws only, gives nothing.
   - At 0 % with a term: instalment 0 gives `ZERO_RATE_ZERO_INSTALMENT`, and 1 Kč passes.
   - A successor block is checked at its own principal and rate, and a good owner with a bad
     successor names only the successor.
   - It gives nothing when `NEGATIVE_AMOUNT`, `NON_FINITE_NUMBER`, `RATE_OUT_OF_RANGE` or
     `INVALID_TERM` is already reported on the block (the guard).
   - It gives nothing for a loan without a term (D-17 already reports it).
   - **Pin of decision 2:** `validateInputs`/`validatePortfolio` still return `[]` for the
     #597 loan.
2. `src/engine/__tests__/principal-clamp.test.ts` (add one property test): for random plain
   loans with a term that pass the rule (instalment from just above the first interest to
   above the annuity, with prepayments, shocks and successors), no row has an instalment
   below its interest. This proves that the first month is enough (§1).
3. `src/state/portfolio/__tests__/instalmentBelowInterest.test.ts`:
   - `addMortgageBlock` and `saveMortgageBlock` reject with an `EngineInputError`
     (`INSTALMENT_BELOW_INTEREST`, `monthlyInstalment`), and nothing is written.
   - With such a block stored, adding a valuation, a lease, a successor block and editing
     the property all succeed.
   - Saving the stored block unchanged is refused, raising its instalment above the interest
     saves, and deleting it succeeds.
4. `src/import/__tests__/` (the plan tests): a `mortgages.csv` row with `loan_term_years` 30
   and `monthly_instalment` 1000 gives an `inputRule` problem `INSTALMENT_BELOW_INTEREST` on
   `monthly_instalment`. A stored offending block is not reported when the import writes
   other rows.
5. `src/state/__tests__/` (the restore rules): `checkInputRules` returns no issue for a
   backup holding the #597 loan.
6. `src/ui/model/__tests__/dataCheckInstalmentBelowInterest.test.ts`:
   - The finding is in `attention` with the start date, the instalment and the interest,
     at an as-of date before and after the block's start.
   - It is listed for a replaced past block (owner, Q3).
   - It is absent for the sample portfolio and for a development loan.
   - `findingFix` gives `financing`; `findingText` uses `dataCheck.instalmentBelowInterest`.
   - The Dashboard pill count goes up by one.
7. A component test in the MortgageForm tests: a refused save shows
   `inputRules.INSTALMENT_BELOW_INTEREST` inline on the instalment field and keeps the
   dialog open (ADR 0141).
8. The existing i18n key-parity test covers the new key in en/cs/ru.

## Alternatives considered

- **Capitalise the unpaid interest (negative amortization, #597 option B).** Rejected for
  now. It would make the projection honest for any instalment, but it changes the figures of
  every stored loan of this kind (debt, LTV, interest, cash flow, IRR), which goes against
  owner decision 2. It also models something Czech consumer mortgages do not offer, and it
  touches the kernel, the reference models and the ADR 0137 floor. It could later replace
  the clamp for legacy data, as a separate ADR and a figures change. That is the natural
  follow-up for the debt ID in §3.
- **Refuse in the engine (`blockIssues` / `assertLoanInputs`, the literal "#597 option A
  via `validateInputs`").** Rejected. It is the simplest code change, but restore would
  refuse such a backup, and the engine would throw for a stored loan, so the Dashboard and
  Property detail would show the invalid-data notice instead of figures (as ADR 0258
  describes for another rule). That breaks owner decision 2. The owner's first comment on
  #597 listed restore among the refusals; the second comment narrowed it, and this ADR
  follows the second.
- **Warn only (#597 option C, today plus a Data check line).** Rejected by the owner
  (decision 1). A typo would keep producing vanished interest for new data, and
  `docs/csv-import.md` already promises the rule.

## Owner decisions (2026-11-26, on #597)

The draft's six open questions, answered by the owner:

1. **Restore:** load silently; the Data check flags the loan (§5).
2. **A 0 % loan with a term and a 0 Kč instalment:** refused, `ZERO_RATE_ZERO_INSTALMENT`
   (§1).
3. **Which stored blocks the Data check lists:** every stored block that fails the rule,
   replaced past blocks included (§4). Property detail's `underpays` warning stays as it is.
4. **The principal clamp on legacy loans:** a new debt issue, #611; #597 closes when the
   refusal ships (§3).
5. **Refusal text:** the existing `inputRules.INSTALMENT_BELOW_INTEREST` text ("would never
   be repaid") stays; no new key.
6. **`dataCheck.instalmentBelowInterest`:** the en text is approved verbatim; cs and ru with
   the same meaning go in the PR for review.

Addendum (owner, 2026-11-26, on PR #613): the wording of decision 6 is corrected, and a
second key is added. The "or remove the term" advice is dropped as wrong: a loan without a
term is refused by D-17 on the same test. "Is below" becomes "does not cover", as the rule
also refuses an equal instalment and the amounts are rounded, and the sentence opens with
"Mortgage from", as the neighbouring `dataCheck` keys do. A stored 0 % loan with a term and
a 0 Kč instalment gets its own sentence, `dataCheck.zeroRateZeroInstalment`, chosen by the
finding's code (`ZERO_RATE_ZERO_INSTALMENT`). The approved en texts:

- `dataCheck.instalmentBelowInterest`: "Mortgage from {date}: the instalment {instalment}
  does not cover the first month's interest {interest}. The figures leave the unpaid
  interest out until the next rate reset. Raise the instalment to save this loan again."
- `dataCheck.zeroRateZeroInstalment`: "Mortgage from {date}: an interest-free loan with a
  term needs an instalment above 0 Kč. Raise the instalment to save this loan again."

The cs and ru texts of both keys are approved as in the dictionaries.
