# Wording log

Approved changes to the app's copy that need no ADR (ADR 0152). Append-only: add new
entries at the end and never rewrite an old one; a later entry may correct an earlier one.

## What belongs here

Only a change to the text of existing i18n dictionary entries (`src/i18n/{en,cs,ru}.ts`),
except text used as an accessible name (`aria-label`, a labelled control) or a live-region
announcement. Anything else needs an ADR (ADR 0001, ADR 0152): a change to a computed number,
a limit or rejection, an export, the stored data, the layout, or what assistive technology
announces (roles, names, live regions). When unsure, write an ADR.

The gate is the same as for an ADR (ADR 0001): the owner's OK and a failing test written
first.

## Entry format

Cite dictionary keys, never the translated strings; the dictionaries hold the current text.

```markdown
### YYYY-MM-DD · #issue / PR #nn

- Keys: `section.key`, `section.otherKey` (en, cs, ru)
- Change: what the text now says or does differently, in one or two sentences
- Rejected: the option that was not taken, and why
- Approved by: owner, YYYY-MM-DD
```

## Entries

### 2026-10-11 · #146 / PR #326

- Keys: `scenarios.sumInflationShock`, `scenarios.sumRateShock` (cs)
- Change: the Czech scenario list summary declines the year word with `csPlural`
  ("na 1 rok", "na 3 roky", "na 5 let") instead of "l." for every count. The sign change
  in the same keys is ADR 0178's.
- Rejected: also renaming the presets (`scenarios.rateForYears`, `scenarios.inflForYears`),
  because a preset is found by its saved name (ADR 0093) and a preset saved under the old
  name would be added a second time; leaving it for a later Czech copy pass.
- Approved by: owner, 2026-10-11

### 2026-10-11 · #260 / ADR 0180

- Keys: `backup.warnOutOfRange` (ru); `dataCheck.outOfRangeFixation`,
  `dataCheck.outOfRangeTerm`, `dataCheck.outOfRangeHorizon` (cs, ru)
- Change: the Russian restore warning says the app uses the values in its calculations
  instead of the awkward "считает с ними". The Czech and Russian out-of-range rows name the
  year word after the value, declined with `csPlural` / `ruPlural` ("60 let", "101 год"), as
  English already says "60 years"; the three entries take the value as a number for it.
- Rejected: leaving the unit to the range in brackets only, because the value then reads
  as a bare number ("doba fixace 60 je mimo…").
- Approved by: owner, 2026-10-11 (#260, all items)

### 2026-10-13 · #251, #242, #156, #173, #330 / Track 14 N7a

- Keys: `propertyDetail.interestSaved`, `forms.positiveAmount`, `dashboard.financingUpcoming`,
  `dashboard.financingNoEvents`, `guide.mortgagesProse3` (en, cs, ru);
  `propertyDetail.helpPrepayments`, `propertyDetail.loanSummaryHint`,
  `propertyDetail.interestSavedNa`, `dashboard.financingInterestSavedNa` (en)
- Change: the property page's interest-saved label names its window (the loan's remaining
  life), as the Dashboard's does (#251). A prepayment or maturity-change row's amount error
  says to put a space between thousands, as the money hint does (#242). The Dashboard's
  upcoming list says it holds rate, loan and lease dates instead of "nothing modelled" (#156,
  the scope of ADR 0103 §7: fixation ends, payoffs, completions, lease ends). Tranche
  draws, prepayments, maturity changes, lease starts and a future purchase are still not
  listed; the purchase follows with #33. In
  English, a prepayment fee is paid from your own funds, not "in cash"; "recast" becomes
  "maturity change" as in every other string (#173 items 1, 3). The Guide says a prepayment
  is applied right after the next payment due on or after its date, not on its date (#173
  item 2, all three languages), and that the property page also warns when a prepayment
  cannot shorten the term (#330 item 1, ADR 0179).
- Rejected: keeping the "Next 12 months" heading and listing the four kinds in the empty text
  only, because the heading still reads as "everything modelled" when rows are shown; the
  help text and workaround of #164 (B + D), obsolete since the engine change of ADR 0179.
- Approved by: owner, 2026-10-13 (N7a plan, exact text)

### 2026-10-13 · #169, #152 / Track 14 N7b

- Keys (plain text; accessible names, form alerts, export text and code are in ADR 0187):
  `dashboard.kpiSumPrincipalRepaid*`, `dashboard.financingNoLoans`, `dashboard.subFilter`,
  `dashboard.monthlyHint`, `propertyDetail.helpDraws`, `instalmentHintDev`,
  `warnAfterCompletion`, `drawnAtStartNoDate`, `drawdownTotal`, `acqHint`, `mortgagesHint`,
  `helpCompletionDate`, `helpNewBlock`, `fixationEnded`, `fixationGap`, `noEffectNote`;
  `scenarios.reachHits`, `scenarios.reachNone`; `backup.folderHint`, `restoreBody`,
  `restoreWarning`, `backup.tables.holding_costs`; `importPage.errMalformedRow`;
  `about.appBody`; Guide prose and definitions (`cardAsOfBody`, `mortgagesProse1Mid`,
  `mortgagesProse1Post`, `mortgagesProse2Resets`, `mortgagesProse2Reamortizes`,
  `projectionProse2`, `developmentProsePost`, `fPrincipal`, `fNewBalance`, value, debt,
  costs, NOI, debt-service and rate-shock definitions, glossary annuity)
- Change: Russian uses "основной долг" for principal, "выбрано / выбранная" for drawing,
  "страховочная копия" for the pre-restore copy, "конец фиксации" and "ставка после
  фиксации", "график платежей", "Результаты" for outputs, and no calques ("переякоривает",
  "переамортизируется", "сброс"). Czech uses "konec fixace" and "sazba po skončení fixace",
  "začátek" for a loan's start, "náklady na držbu", "splátkový kalendář", "samo aktivum" and
  a plain monthly hint ("roční výše při současných nájmech ÷ 12"). English drops "refix".
  The CSV row-length error and the Russian filter subtitle decline their count word. The
  Guide says that only fixed costs (tax, insurance, SVJ, other) grow with CPI while
  management and maintenance follow rent (all three languages), and that the base-date
  snapshot equals year 0 for value, debt and equity, with flows starting in year 1.
- Rejected: "транш" for every draw string (#169 suggestion), because "выборка" is the
  banking word for drawing a credit line and "транш" stays for each portion; renaming
  English "rate reset" (owner: English jargon only); reformatting the crash preset labels
  "−20%" (a saved preset is found by name, ADR 0093).
- Approved by: owner, 2026-10-13 (N7b plan, batches A–F, exact text)
