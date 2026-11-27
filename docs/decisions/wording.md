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
  `dashboard.kpiSumPrincipalRepaid`, `dashboard.kpiSumPrincipalRepaidNominal`,
  `dashboard.financingNoLoans`, `dashboard.subFilter`, `dashboard.monthlyHint`,
  `dataCheck.earlyDateRecord.assumptions`; `propertyDetail.helpDraws`,
  `propertyDetail.instalmentHintDev`, `propertyDetail.warnAfterCompletion`,
  `propertyDetail.drawnAtStartNoDate`, `propertyDetail.drawdownTotal`,
  `propertyDetail.acqHint`, `propertyDetail.mortgagesHint`,
  `propertyDetail.helpCompletionDate`, `propertyDetail.successorNote`,
  `propertyDetail.fixationEnded`, `propertyDetail.fixationEndedUntil`;
  `importPage.noEffectNote`, `importPage.errMalformedRow`; `scenarios.sumResetRate`;
  `backup.folderHint`, `backup.restoreBody`, `backup.restoreWarning`,
  `backup.tables.holding_costs`; `about.appBody`; Guide prose and definitions
  (`guide.cardAsOfBody`, `mortgagesProse1Mid`, `mortgagesProse1Post`,
  `mortgagesProse2Resets`, `mortgagesProse2Reamortizes`, `projectionProse2`,
  `developmentProsePost`, `fPrincipal`, `fNewBalance`; `snapshotDefs.value.meaning`,
  `snapshotDefs.debt.meaning`, `snapshotDefs.noi.meaning`,
  `snapshotDefs.debtService.meaning`, `projectionDefs.debt.formula`,
  `projectionDefs.debt.meaning`, `projectionDefs.costs.formula`,
  `projectionDefs.costs.meaning`, `scenarioDefs.rateShock.formula`,
  `scenarioDefs.rateShock.meaning`, `glossary.annuity.def`, `glossary.propertyTax.def`)
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

### 2026-11-15 · #380 / ADR 0201

- Keys: `scenarios.emptyList` (en, cs, ru)
- Change: the empty scenario list points to the renamed button, "Add scenario" (the
  button's own name and the dialog title are accessible names, so ADR 0201 has them).
- Rejected: leaving the old button name in the hint, because no button reads that any
  more.
- Approved by: owner's delegation of 2026-11-15 (comment on #392), owner review pending

### 2026-11-16 · #379 / ADR 0205

- Keys: `common.undrawnDebt` (en, cs, ru)
- Change: the undrawn note is shorter, so it wraps inside the Properties Debt column
  instead of widening it: "+3,0 M Kč to draw" (was "plus 3,0 M Kč still to draw"), cs
  "+3,0 M Kč k dočerpání", ru "+3,0 M Kč к выборке". It reads the same on the Dashboard
  net-worth tile and the Property detail debt tile; the meaning of ADR 0169 is unchanged.
  The amount never breaks before its unit, and in cs a non-breaking space keeps "k" with
  "dočerpání" (Czech typography: no one-letter preposition at a line end).
- Rejected: a Properties-only short text beside the long one, because one note for one
  figure should read the same on every screen.
- Approved by: owner's delegation of 2026-11-15 (comment on #392), owner review pending

### 2026-11-18 · #441 item 1 / PR #554

- Keys: `inputRules.RATE_OUT_OF_RANGE` (en, cs, ru)
- Change: the range message of a rate field reads "from 0 to 100 %" instead of "a fraction
  from zero to one". Every field it shows under takes a percentage: the mortgage rate,
  vacancy, management and maintenance as a share of rent, selling cost and the reset rate,
  in the forms, the scenario form, the invalid-data notice and a refused restore (which
  never shows the stored value). A CSV rate cell, written as a fraction, is refused by the
  CSV parser first with its own message (`importPage.errRateOutOfRange`, unchanged), so no
  field needs the old text and the message is not split. The notice and a form-level error
  show it in a live region, so ADR 0250 records it too.
- Rejected: passing 0 and 100 as arguments, because the unit range is the meaning of a
  rate, not a limit that can move.
- Approved by: owner, 2026-11-18 (#435 comment 6965976270)

### 2026-11-18 · #441 item 2 / PR #554

- Keys: `inputRules.INVALID_RECAST_MATURITY`, `dataCheck.valuationStaleGroup`,
  `dataCheck.leaseEndingGroup`, `common.irrNoRoot` (en, cs, ru)
- Change: these texts take the limit they name as an argument instead of repeating it:
  the recast cap from `INT_RANGES.loanTermYears.max`, the Data check thresholds from
  `VALUATION_STALE_MONTHS` and `LEASE_ENDING_MONTHS` (`src/ui/model/dataCheck.ts`), and the
  IRR search range from the engine's `IRR_BRACKET_LOW` and `IRR_BRACKET_MAX`. Numbers are
  formatted by `fmtNumber` and `fmtPct`, and the count word follows the number's plural
  form in each language. At today's limits the words are unchanged; the IRR note reads
  "+1 000 %" with the thousands space of `fmtPct` (was "+1000 %"). Input rules are read
  through `inputRuleText` (`src/ui/model/inputRule.ts`). The Data check headlines are part
  of the chips' accessible names, the IRR note is screen-reader text and a compare-export
  note, and the input rules show in live regions, so ADR 0250 records them too.
- Rejected: building the strings from the constants inside the dictionaries, because the
  dictionaries import no limits and the other entries with numbers take arguments.
- Approved by: owner, 2026-11-18 (#435 comment 6965976270)

### 2026-11-18 · #441 item 4 / PR #554

- Keys: none; the crash preset labels are built in `src/ui/model/scenarios.ts`
  (`crashLevel`), and `scenarios.crashTitle` and `scenarios.combinedTitle` take them
  (en, cs, ru)
- Change: a crash preset's label is its fall formatted by `fmtPct`, "−10,0 %", "−20,0 %",
  "−35,0 %" (was the stored text "−10%"), on the preset buttons and in the name a preset
  saves, the combined presets included. This corrects the entry of 2026-10-13 (Track 14
  N7b), which kept the old labels because a saved preset was found by name: since ADR
  0191 a preset matches a saved scenario by its settings, so a scenario saved under the
  old name is still found. The labels are part of the buttons' accessible names, so ADR
  0250 records them too.
- Rejected: keeping a hand-written label beside the value, because it repeats the value
  and does not follow the app's percent format.
- Approved by: owner, 2026-11-18 (#435 comment 6965976270)

### 2026-11-18 · PR #529 review / #435

- Keys: `projections.yearSpan` (en, cs, ru)
- Change: the spaces around the en dash in the projection years' month range are no-break
  spaces (U+00A0, as `src/lib/format.ts` uses), so the Projections page subtitle and the
  property page's projection hint no longer wrap inside the range ("Jul" / "– Jun" at
  1280 px, PR #529 review). The words are unchanged. The text is not an accessible name or
  a live region: it is the page subtitle and a panel hint.
- Rejected: also changing the year spans built in `periodLabelLocalized`
  (`src/ui/model/projection.ts`: the Year cell's tooltip and screen-reader text, the
  export's Period column, the Dashboard and Properties as-of lines), because they are not
  dictionary text, some are screen-reader text or export cells that need an ADR, and the
  decision covers the range label only.
- Approved by: owner, 2026-11-18 (#435 comment 6965976270, item "#529")

### 2026-11-18 · #446 / ADR 0255

- Keys: `boot.notSaved` (en, cs, ru), new
- Change: after a save whose read-back failed, the error screen says which writes queued
  behind it were refused and not saved, and asks to enter them again once the app opens.
  The line introduces a list of names taken from existing entries (`backup.tables.*`,
  `common.importCsv`, `backup.restoreTitle`, `sample.confirm`, `sample.loadAction`). The
  text is inside the screen's `role="alert"`, a live region, so ADR 0255 records it too.
- Rejected: rewording `boot.readBackFailed`, which keeps its text, because it is still
  true for the change that committed and the list names the ones that were not.
- Approved by: owner OK 2026-11-18 (the decision in #435 comment 6965976270; the text in
  #564 comment 6975468652)

### 2026-11-18 · #564 review / ADR 0255

- Keys: `boot.notSaved` (ru)
- Change: the Russian line opens with the plural short form, so the participle agrees
  with its subject «эти изменения» (#564 review, finding F4). The rest of the line, and
  the en and cs texts, are unchanged.
- Rejected: the review's other suggestions (rewording the rest of the Russian line,
  "do them again" for the action items, and renaming `backup.tables.leases`), which the
  owner did not take up.
- Approved by: owner, 2026-11-18 (in session)

### 2026-11-18 · #448 / ADR 0258

- Keys: `errorBoundary.leftoverBlock` (en, cs, ru), new
- Change: when stored mortgage blocks of one property start one month or less apart
  (`inputRules.REFINANCE_WITHIN_A_MONTH`), the invalid-data notice adds a line naming the
  property and both start dates, says one block is usually left over from a corrected start
  date, and asks to delete it or edit its start date in Financing
  (`propertyDetail.sectionFinancing`). It follows the `dataCheck.leaseOverlap` phrasing. The
  text is inside the notice's `role="alert"`, a live region, so ADR 0258 records it too.
- Rejected: rewording `inputRules.REFINANCE_WITHIN_A_MONTH`, which forms, CSV import and
  restore share and which names no dates; and a Data check finding, which never renders
  while the engine refuses the property.
- Approved by: the hint, owner 2026-11-18 (#435 comment 6965976270); the text, owner OK
  2026-11-18 (#448 comment 6979206969)

### 2026-11-24 · #464 / ADR 0259

- Keys: `forms.intRange`, `forms.sizeRange` (en, cs, ru); `importPage.errOutOfRange`,
  `importPage.errSizeRange`, `backup.issueOutOfRange`, `backup.issueOutOfRangeSize`
  (en, cs, ru), deleted
- Change: the two form keys take the text of `backup.issueOutOfRange` and
  `backup.issueOutOfRangeSize` (the restore wording) and become the one range message: form fields, store refusals, CSV import and restore
  all use them. The CSV text no longer quotes the value. The form keys can show in a
  `role="alert"` line (a range refused on a field the form does not show), so ADR 0259
  records it too.
- Rejected: keeping the quoted value in the CSV text, which would need a third key; the
  error table already names the file, row and column.
- Approved by: the text, owner OK 2026-11-18 (#464 comment 6978842455); ADR 0259, owner
  review 2026-11-24 (recorded on #464)

### 2026-11-25 · #485 follow-up / PR #603

- Keys: `dashboard.financingRowsNominalDisclaimer` (en, cs, ru), new;
  `dashboard.financingRowsNominal` (en, cs, ru), deleted
- Change: the Dashboard Financing note in the real lens, shown when the timeline has rows,
  is one entry instead of `dashboard.financingRowsNominal` and `dashboard.financingDisclaimer`
  joined in code with a space (`financingView`), so Czech and Russian can phrase the whole
  note. Its text is today's joined text in each language, so nothing shown changes.
  `dashboard.financingRowsNominal` had no other use and is deleted;
  `dashboard.financingDisclaimer` stays the note in the nominal lens and without rows.
- Rejected: keeping the join, which fixes the order of the two sentences and the space
  between them in every language.
- Approved by: owner OK 2026-11-25 (recorded in the #435 log)

### 2026-11-26 · #597 / ADR 0264

- Keys: `dataCheck.instalmentBelowInterest`, `dataCheck.zeroRateZeroInstalment` (en, cs,
  ru), new
- Change: the Data check's "Needs attention" line for a stored plain loan with a term whose
  instalment does not cover its first month's interest. It opens "Mortgage from {date}" as
  the neighbouring `dataCheck` keys do, names the instalment and that interest, says the
  figures leave the unpaid interest out until the next rate reset, and asks to raise the
  instalment to save the loan again. A 0 % loan with a 0 Kč instalment
  (`ZERO_RATE_ZERO_INSTALMENT`) gets its own sentence, chosen by the finding's code, instead
  of reading "0 Kč … 0 Kč". "Does not cover" rather than "is below", as the rule also
  refuses an equal instalment and the amounts shown are rounded. The list is
  `role="list"`, not a live region; ADR 0264 records the finding.
- Rejected: also advising "or remove the term", which is wrong: a loan without a term is
  refused by D-17 on the same test. A term-specific variant of
  `inputRules.INSTALMENT_BELOW_INTEREST` for the refusal; the owner kept the existing text.
  Leaving the 0 % case out of the Data check, which ADR 0264 lists as failing the rule.
- Approved by: en, owner 2026-11-26 (#597 decision 6, corrected on PR #613); cs/ru:
  owner-approved choices (opening noun, 'aby bylo možné', 'расчёты'); final text reviewed
  under the owner's delegation, 2026-11-26

### 2026-11-27 · #463 / ADR 0271

- Keys: `commandErrors.BACKUP_EXISTS`, `commandErrors.BACKUP_PATH_NOT_UTF8`,
  `commandErrors.BACKUP_FAILED`, `commandErrors.BACKUP_UNREADABLE`,
  `commandErrors.BACKUP_CORRUPT`, `commandErrors.BACKUP_MISMATCH`,
  `commandErrors.SAVED_FILE_MISMATCH`, `commandErrors.NO_FOLDER`,
  `commandErrors.NO_FILE_NAME` (en, cs, ru), new
- Change: what went wrong with a backup copy or a saved file, picked by the failed
  command's code, in place of Rust's English detail inside the safety-backup, export,
  CSV template and upgrade messages (ADR 0271). `BACKUP_EXISTS` names the file the webview
  chose; no text shows a path. The words follow the dictionaries: "složka záloh" and
  "папка резервных копий" as in `boot.copyAt`, "kontrola integrity" and "проверка
  целостности" as in `dataErrors.DB_INTEGRITY`.
- Rejected: the translated text followed by the library text in brackets, which brings
  English back into a Czech or Russian message (ADR 0271, resolved question 2).
- Approved by: approved by the owner 2026-11-27 (comment on PR #694): en with ADR 0271
  (the six `BACKUP_*` texts as written, resolved question 4; the three file-write texts
  in decision 3), cs/ru as drafted in ADR 0271 with four changes (cs `SAVED_FILE_MISMATCH`
  and `NO_FILE_NAME`, ru `BACKUP_PATH_NOT_UTF8` and `SAVED_FILE_MISMATCH`)
