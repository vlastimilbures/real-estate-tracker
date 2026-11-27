# 0275. Data check: the current rule

- Status: Accepted
- Date: 2026-11-27
- Source: issue #498 (owner decision 2026-11-27: implement ADR 0272, then one current-rule
  record each for prepayments, sections and the Data check); issue #611 (owner decision
  2026-11-27: the legacy loan below its interest is accepted as is, flagged by the Data
  check)
- Supersedes: [0118](0118-data-check.md), [0206](0206-data-check-grouped.md)
- Supersedes in part: [0122](0122-valuation-persists-past-valid-to.md) (decision 5),
  [0148](0148-restore-rules-vs-stored-data.md) (decision 2),
  [0155](0155-lifecycle-states-on-the-pages.md) (decision 3: its Data check clause),
  [0156](0156-pending-purchase-display.md) (decision 5: the clause that a pending
  property's Data check has only the own-cash finding),
  [0163](0163-leases-never-overlap.md) (decision 5),
  [0180](0180-data-check-restore-asof-polish.md) (decision 4),
  [0181](0181-purchase-price-fallback-grows.md) (decision 4: the `dataCheck.noValuation`
  and `dataCheck.valuationStale` items and the note on their accessible role),
  [0218](0218-dashboard-pill-and-chart-grid.md) (decision 1),
  [0223](0223-data-check-blocks.md) (decisions 1 to 4 and 6),
  [0236](0236-size-one-decimal.md) (decision 3),
  [0264](0264-loan-term-instalment-above-interest.md) (§4 except its bullet on the refusal
  keys; owner decisions 3 and 6 and the addendum on the two `dataCheck` keys)
- Amended by: [0278](0278-code-only-rules-in-current-rule-records.md) (decisions 17 to
  23: the rules only the code stated)
- Related: [0080](0080-close-out.md) (the renewed last lease),
  [0103](0103-financing-exposure.md) (upcoming lease ends),
  [0119](0119-acquisition-funding.md) (own cash and the derived down payment),
  [0129](0129-loan-schedule-edge-cases.md) §4 (the refix gap),
  [0150](0150-one-asof-resolver.md) §1 (the as-of date),
  [0152](0152-wording-log-and-generated-index.md) (copy changes),
  [0157](0157-accessibility-batch.md) (loan warnings as a status),
  [0162](0162-floating-block-rate.md) §4 (a floating block),
  [0199](0199-icon-only-row-actions.md) §2 (the Edit property label),
  [0203](0203-one-disclosure.md)
  (the disclosure button), [0207](0207-holding-costs-read-view.md) §4 (the Holding costs
  landing), [0209](0209-acquisition-empty-state.md) §2 ("Record funding"),
  [0217](0217-info-tip.md) (the info icon), [0232](0232-dates-before-1900-entry-only.md)
  (dates before 1900 are not looked for), [0250](0250-wording-limits-flags-crash-labels.md)
  (thresholds as text arguments), [0257](0257-shock-years-merged-rows-range-checked.md)
  (stored shock years are not flagged), [0259](0259-one-range-message.md) §4 (the Data
  check's range keys unchanged), [0258](0258-leftover-block-hint.md) (invalid stored
  data), [0268](0268-one-chip-shape.md) (the chip look),
  [0274](0274-sections-current-rule.md) (the section order, the pill and an inactive
  property on Property detail), [0269](0269-requests-travel-with-the-visit.md)
  (the fix link's request), [0272](0272-current-rule-likelihood-ui-rounds.md) (why this
  record exists)
- Topic: Data check
- Trigger: n/a (restatement record)
- Likelihood: n/a (adds no handling)

## Context

ADR 0118 added the Data check: a list of the inputs behind a property's numbers that are
stale, missing, left at a portfolio default, or stored with a value the forms no longer
accept. Seven later records amended it, others changed it without saying so, and two of
those (0206, 0148) were amended again. ADR 0272 asks for one record that states the rule as it is
now. This is that record. It changes no behaviour: every statement below comes from an
accepted record, named in brackets after it. Where two records disagree, it follows the
later one and says so (5.2, 3.4). Where the code and the records disagree, the
disagreement is listed on the pull request for the owner and not settled here.

The superseded records keep their context, examples and measurements. Read them for why a
rule is what it is; read this record for what the rule is. Text is cited by dictionary key;
the wording itself lives in the dictionaries and `docs/decisions/wording.md` (ADR 0152).

## Decision

### 1. What the Data check is

1. A pure presentation model, `src/ui/model/dataCheck.ts`, lists the findings for a
   property at an explicit as-of date and never reads the clock (ADR 0118 §1).
2. It calls the engine's own selectors and checks, so a finding appears exactly when the
   engine falls back or the stored value breaks a rule: `selectValuation`, `leaseInForce`,
   `leaseEndWithoutFollowOn`, `renewedLease` and the loan warnings (ADR 0118 §1),
   `overlappingLeases` (ADR 0163 §1, §5) and the instalment rule's predicate (ADR 0264 §4).
   Stored values out of range come from the range check that restore also uses, which is
   not an engine rule: the engine itself is open-ended (ADR 0148 §1, §2; ADR 0180 §2;
   ADR 0236, Consequences).
3. There is no completeness score or grade. Each finding states its effect and where to
   fix it. An effect is stated only where it is true for both the snapshot and the
   projection, or the text says how they differ (ADR 0118 §1).
4. **The as-of date** is the page's snapshot date: the picked date, else today, never
   before the base date, the same date as the numbers on screen (ADR 0118 §2). The one
   as-of resolver moves it into the window from the base date to the base date plus the
   horizon (ADR 0150 §1).
5. Findings fall in two lists: **"Needs attention"**, which is counted, and **"Using
   portfolio defaults"**, which is listed but not counted, because those defaults are often
   deliberate (ADR 0118 §3, §4).

### 2. "Needs attention": dated findings

These are evaluated at the as-of date, for a property purchased by then (5.2).

1. **Stale valuation.** The valuation in use (`selectValuation`) is dated on or before the
   as-of date and is more than 12 months old: the as-of date is after `validFrom` + 12
   months. Exactly 12 months is not stale. The age is shown in whole months. A valuation
   that only starts later is used by the engine and is not flagged (ADR 0118 §3). A closed
   last valuation is still the valuation in use, so it is flagged once it is more than 12
   months old (ADR 0122 §5); its "Valid to" is not read (ADR 0122 §1). The text is
   `dataCheck.valuationStale`; it says that value, equity and LTV start from the valuation
   as entered and that the time between its date and the projection start is not grown.
   The sentence holds at any as-of date, since after the projection start the value does
   grow; Settings carries no note on it (ADR 0181 §4).
2. **No valuation.** The property has no valuation at all, so the purchase price stands in
   as the value (ADR 0118 §3; ADR 0122 §5). The text is `dataCheck.noValuation`; it names
   the purchase date, the price grown at the appreciation rate since then. The finding
   carries the purchase date and the UI computes no grown number (ADR 0181 §4). It stays a
   "Needs attention" finding: the grown price is an estimate, and a recorded valuation
   replaces it (ADR 0181, Consequences).
3. **Lease ended.** No lease is in force and the last lease ended before the as-of date, on
   or after the projection's basis date. The snapshot has no rent after its end; the
   projection treats it as renewed (`renewedLease`, ADR 0080), so a Dashboard read from a
   projection year still shows its rent. The text (`dataCheck.leaseEnded`) says both
   (ADR 0118 §3).
4. **No lease in force** otherwise (no lease, a gap before a later lease, or a last lease
   that ended before the basis date): rent counts as 0 (`dataCheck.noLease`,
   ADR 0118 §3).
5. **Lease ending.** The lease in force ends within 3 months, the as-of date included, and
   no later lease is entered. This is the rule of the Dashboard's upcoming lease ends
   (ADR 0103), one shared engine helper (ADR 0118 §3). Gaps between consecutive leases are
   not flagged (ADR 0118 §8).
6. **Fixation ended with no follow-on block** at the as-of date: Property detail's loan
   warning, with the same text. That warning stays in Financing and is still evaluated at
   the base date, so for a fixation ending between the base date and the as-of date only
   the Data check shows it (ADR 0118 §3). When a later block starts after the first payment
   at the reset rate, the gap is flagged too, and the text carries that block's start
   ("from … until …", ADR 0129 §4). A floating (0-year) block never counts as an ended
   fixation (ADR 0162 §4).

### 3. "Needs attention": stored values the forms no longer accept

These are stored values, not dated: each is listed at any as-of date (ADR 0163 §5;
ADR 0264 §4), before the property's purchase date too (5.2). The forms already refuse to
save them, so the owner fixes them there (ADR 0148 §2).

1. **Out of range.** A property's size (fix: the property form), a mortgage's fixation or
   loan term (fix: Financing), and on the Dashboard the projection horizon as a portfolio
   row (fix: Settings → Assumptions), each with the value and the range (ADR 0148 §2).
   - A value finer than its field accepts counts as well: for the horizon, fixation and
     loan term a number that is not whole (ADR 0180 §2), for the size one with two or more
     decimals (next bullet). Only the size reaches the Data check this way: the engine
     refuses a non-integer horizon, fixation or loan term, and that engine error is the one
     reported (ADR 0180 §2).
   - The size takes one decimal place: a stored size with one decimal is not listed, one
     with two or more is (`dataCheck.sizeDecimals` inside the range,
     `dataCheck.outOfRangeSize` outside it) (ADR 0236 §3 and Consequences).
   - The stored value is shown with every decimal (`fmtNumber`, ADR 0180 §2). A mortgage's
     row names the loan by its start date (`dataCheck.outOfRangeFixation`,
     `dataCheck.outOfRangeTerm`; ADR 0148 §2; ADR 0180, Context item 3).
   - Range messages elsewhere were unified; the Data check's `dataCheck.outOfRange*` keys
     were left as they are (ADR 0259 §4).
2. **Overlapping leases.** A stored pair of leases of one property that overlap, one row per
   pair with both start dates (`dataCheck.leaseOverlap`); the fix link goes to the
   property's records (ADR 0163 §5). The projection keeps reading such a pair two ways
   until the owner fixes it; the Data check points to it (ADR 0163 §6).
3. **A loan below its first month's interest** (`instalmentBelowInterest`). A stored plain
   loan with an explicit term whose entered instalment is at or below its first month's
   interest, which ADR 0264 §1 refuses for new entries, edits and CSV import
   (ADR 0264 §4):
   - The finding carries the block's start date, its entered instalment and its first
     month's interest. The interest comes from the engine, never from maths in the UI
     (ADR 0264 §4).
   - It is listed for every stored block of the property that fails the rule, replaced
     past blocks included, not only from the block in force onward (ADR 0264 §4; owner
     decision 3). A block with another problem on its principal, rate, instalment or term
     is not checked against this rule: that problem is reported first (ADR 0264 §1,
     "Guard").
   - Its fix link is Financing. Its sentence holds per-loan values, so on the Dashboard it
     is its own line with no chip detail (ADR 0264 §4).
   - Text: `dataCheck.instalmentBelowInterest`, and `dataCheck.zeroRateZeroInstalment` for a
     0 % loan with a term and a 0 Kč instalment, chosen by the finding's code
     `ZERO_RATE_ZERO_INSTALMENT`. The en texts are owner-approved; cs and ru carry the same
     meaning (ADR 0264 §4, owner decision 6 and its addendum).
   - Property detail's `underpays` loan warning stays as it is (ADR 0264 §4; owner
     decision 3).
   - **Today's rule for such a loan** (owner, 2026-11-27, on #611): it is accepted as is.
     The owner's own Data check shows no such loan, so only a loan saved before ADR 0264,
     or restored from an older backup, can reach the principal clamp. Such a loan loads,
     restores and projects as before, with the unpaid interest left out until the next
     rate reset (ADR 0264 §3, §5); the clamp stays pinned as today's behaviour, and the Data
     check finding is the one handling. No change of figures is planned.
4. **Not looked for:** a stored date before 1900 (ADR 0232 §2, §4), and a stored scenario
   shock year outside its range (ADR 0257). The Dashboard's portfolio rows are the
   projection horizon only. ADR 0180 §4 also named the base date, whose only check was the
   early-date finding that ADR 0232 §4 removed; this record follows ADR 0232.

### 4. "Using portfolio defaults"

Listed below "Needs attention", not counted (ADR 0118 §4):

1. **Growth.** The property has no own appreciation and/or rent indexation, so the
   portfolio levels apply (ADR 0118 §4); the three cases have their own sentences
   (`dataCheck.growthBoth`, `growthAppreciation`, `growthRentIndexation`). Fix: the
   property form (ADR 0118 §7).
2. **Holding costs.** The property's holding costs are missing or have blank fields, and
   the fields are named (`dataCheck.costDefaults`, ADR 0118 §4). Fix: Holding costs; the
   link lands on that panel (ADR 0118 §7; ADR 0207 §4).
3. **Own cash at purchase is not recorded** (ADR 0118 §4; ADR 0119):
   - It fires when the funding record has no own cash, even when it holds transaction
     costs, initial works or a note: own cash alone drives Cash invested (Property detail
     and the Dashboard total) and a future purchase's outflow. Own cash of 0 is recorded
     and resolves it.
   - Its text states the effect: Cash invested is unknown (`dataCheck.fundingUnknown`); for
     a property bought after the base date the projection also derives the down payment
     (`dataCheck.fundingUnknownFuture`; ADR 0119 §5). That second part follows the purchase
     date only: it does not check whether the property is inactive or bought after the
     horizon, where the projection leaves it out altogether.
   - Its fix, "Record funding" (`dataCheck.recordFunding`, target `editFunding`), opens the
     property form with its Acquisition section open and focus on own cash (ADR 0118 §4,
     §7). The Acquisition panel's own button shares the label (ADR 0209 §2).

### 5. Scope

1. **Dashboard:** the active properties its filter shows, plus the portfolio rows (the
   projection horizon) first (ADR 0180 §4; ADR 0206 §4). With no active property (none
   recorded, or all deactivated) the Dashboard shows its empty or all-inactive state and no
   Data check (ADR 0180 §4).
2. **A property not yet purchased** at the as-of date has none of the dated findings of
   section 2 and none of the growth or holding-cost defaults. It keeps the own-cash
   finding, because a future purchase's own cash is its down payment in the projection and
   is worth recording before the purchase date (ADR 0118 §5; ADR 0156 §5). It also lists
   the stored values of section 3: ADR 0163 §5 and ADR 0264 §4 list them "at any as-of
   date", which widens the "own-cash finding only" of ADR 0118 §5 and ADR 0156 §5; this
   record follows the later records.
3. **Property detail:** its own property, when active. An inactive property has no Data
   check section or section-nav entry and is left out of every computation; its values are
   listed once it is reactivated (ADR 0155 §3; ADR 0180 §4; ADR 0274 §2.6). The restore
   confirm step names the record either way, and its warning that "the Data check lists" the
   values means these places together; that warning's text does not change (ADR 0180 §4).
4. With stored data that breaks an engine rule, the page shows the invalid-data notice
   instead of the figures, and the Data check does not render (ADR 0258, Context).
5. A valuation source field is not part of the Data check (roadmap, ADR 0118 §8).

### 6. Where it shows and how it looks

1. **Dashboard.** The Data check is the last section of the page, after Key performance
   indicators (ADR 0206 §1; ADR 0218 §3). Its panel opens when something needs attention
   and shows only its head otherwise; a manual Show / Hide holds for the app session
   (ADR 0118 §6; ADR 0206 §5). The toggle is the shared disclosure button on the right of
   the panel head, its state kept in the UI store for the session (ADR 0203 §1–§3; ADR 0223
   §1).
2. **Property detail.** The Data check is a section of the page, listed in the section nav
   (ADR 0118 §6); it is the last section (ADR 0223 §5; ADR 0274 §2.1). Only the
   Dashboard's panel has a Show / Hide (ADR 0223 §1).
3. **One look on both pages** (ADR 0223 §1–§4):
   - **Counts.** Two counts sit as pills on their own line directly under the panel head,
     visible while the panel is collapsed too: the warn count `dataCheck.needAttention`
     with a warning icon, or a green check with `dataCheck.attentionNone` when nothing
     needs attention; and the neutral `dataCheck.useDefaults` with an info icon when any
     finding uses defaults (ADR 0223 §1). Counts are counts of findings, not of grouped
     lines (ADR 0206 §3). The warn count has the shared warn chip look, the same as the
     title pill (ADR 0268 §1, §2).
   - **As-of note.** `dataCheck.asOfNote` sits behind the info icon after the title
     (ADR 0223 §1; ADR 0217).
   - **Blocks.** The body holds a "Needs attention" block (amber-tinted head,
     `dataCheck.attentionTitle`) and a "Using portfolio defaults" block (neutral head,
     `dataCheck.defaultsTitle`), each an `h3` over a list it names. When both are present
     they sit side by side on a container of 880 px or more and stack below; a block with
     no findings is not shown (ADR 0223 §2). Each list is `role="list"`, not a live region
     (ADR 0264 §4).
   - **Rows.** Each finding is a hairline-separated row: its icon (warning for attention,
     info for defaults), the problem, then its action right-aligned, or under the problem
     in a block narrower than 680 px (ADR 0223 §3; ADR 0206 §4).
   - **All clear.** With no findings at all, the panel is the title and one quiet line, a
     green check and `dataCheck.attentionNone`: no pills, no toggle, no blocks. The as-of
     note stays behind the info icon (ADR 0223 §4).
4. **Dashboard rows are grouped by problem** (`dataCheckGroups`, ADR 0206 §4): one line
   states the problem and its effect once, with one chip per affected property, holding
   that property's detail, as the row's action on the right (ADR 0206 §4; ADR 0223 §3).
   Groups keep the order in which each problem first appears, so portfolio rows come first
   (ADR 0206 §4).
   - Stale valuation: `dataCheck.valuationStaleGroup`; chip detail the age and the
     valuation date.
   - No valuation: `dataCheck.noValuationGroup`; detail the purchase price and date.
   - Lease ended / ending: `dataCheck.leaseEndedGroup` / `dataCheck.leaseEndingGroup`;
     detail the end date.
   - Fixation ended with no follow-on block: `dataCheck.fixationEndedGroup(rate)`; detail
     the fixation end. The loan's start date is left out. A gap before a later block keeps
     its own sentence (ADR 0206 §4).
   - Every other finding keeps its own sentence as the line; equal sentences share a line,
     each property a chip without detail (ADR 0206 §4).
   - The 12-month and 3-month thresholds reach the group texts as arguments, so a change
     to them changes the text in every language (ADR 0250).
5. **Property detail rows** keep one sentence per finding, with no property-name prefix
   (ADR 0206 §6), and the action is the fix link, described by its row (ADR 0223 §3). Its
   label is `dataCheck.goTo` with the section's name for a section,
   `properties.editProperty` for the property form (ADR 0199 §2) and
   `dataCheck.recordFunding` for own cash (ADR 0118 §7; ADR 0209 §2). Property detail has
   no count sentence of its own: the pills carry the counts (ADR 0223 §6).
6. **The title's review pill** (ADR 0218 §1; ADR 0223 §5; ADR 0274 §2.5):
   - When at least one finding needs attention, a compact amber pill follows the page
     title: a warning icon and the number. Its accessible name and tooltip are the full
     sentence `dataCheck.reviewPill(n)`. It is absent when nothing needs attention;
     defaults never show it (ADR 0206 §2; ADR 0218 §1).
   - On the Dashboard a click opens the Data check, scrolls it to the top and moves focus
     to its heading (ADR 0206 §2; ADR 0218 §1, "the same jump as before"). Property
     detail shows the same pill, which moves focus to its Data check heading (ADR 0223 §5;
     ADR 0274 §2.5).
   - The filter bar holds filters only: it has no review link, and the as-of picker has no
     lead slot (ADR 0218 §1).

### 7. Fix links

1. Each finding links straight to its fix: valuation and lease findings (overlaps included)
   to Records, the fixation and a loan below its interest to Financing, holding costs to
   Holding costs, growth and the size to the property form, own cash to the property form
   with its Acquisition section open, and the horizon to Settings → Assumptions (ADR 0118
   §7; ADR 0148 §2; ADR 0163 §5; ADR 0264 §4).
2. From the Dashboard the link opens the property and then moves to that section; the
   unsaved-changes guard applies as for any navigation (ADR 0118 §7). The request travels
   with that navigation and is dropped when the visit ends, handled or not (ADR 0269 §1,
   §2).
3. On the Dashboard the chip is the link. Its accessible name is the chip text followed by
   the problem line; its description and tooltip name the destination (ADR 0206 §4). A
   portfolio chip reads its fix as its text, `dataCheck.goTo` with
   `settings.tabs.assumptions` (ADR 0206 §4; ADR 0180, Consequences).
4. **Accessible-name text.** On Property detail a finding's sentence is its fix link's
   description, not its accessible name (ADR 0181 §4; ADR 0223 §3). On the Dashboard every
   line is part of each chip's accessible name (ADR 0206 §4), so every `dataCheck` key that
   words a line counts as accessible-name text for a copy change (ADR 0152; ADR 0250): the
   group keys (`valuationStaleGroup`, `noValuationGroup`, `leaseEndedGroup`,
   `leaseEndingGroup`, `fixationEndedGroup`) and the sentences that serve as lines
   (`noLease`, `leaseOverlap`, `instalmentBelowInterest`, `zeroRateZeroInstalment`, the
   `outOfRange*` keys, `sizeDecimals`, the `growth*` keys, `costDefaults` and the
   `fundingUnknown*` keys).
5. **Live regions.** The Data check's own lists are `role="list"`, not live regions
   (ADR 0264 §4). Outside the Data check, `dataCheck.goTo` labels the Financing button of
   Property detail's invalid-data notice, a `role="alert"` region (ADR 0258 §2). The
   fixation-ended text is shared with Property detail's loan warning, which renders in
   Financing as a status banner (`role="status"`, ADR 0157).

## Consequences

- ADRs 0118 and 0206 are superseded by this record. ADRs 0122, 0148, 0155, 0156, 0163,
  0180, 0181, 0218, 0223, 0236 and 0264 are superseded in the parts named in the header;
  their other decisions stand.
- A change to the Data check amends this record, not the superseded ones (ADR 0272 §1).
- The sample portfolio shows no "Needs attention" finding at its base date, and the growth
  defaults and the own-cash finding for all three properties (ADR 0118, Consequences). At
  +5 years its Dashboard Data check has four lines (stale valuation, fixation ended, growth
  defaults, own cash) with twelve chips (ADR 0206, Consequences).
- No behaviour, layout, dictionary entry, parity target or golden-master value changes.
