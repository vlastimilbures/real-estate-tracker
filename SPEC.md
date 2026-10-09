# Real Estate Portfolio App — Specification

Describes the behaviour of the current release; planned work lives in
[`docs/roadmap.md`](docs/roadmap.md).

Decisions that shaped a rule are cited as `ADR nnnn` (see `docs/adr/`). Parity targets and the
sample portfolio live in `.claude/rules/engine-parity.md`.

## 1. Overview

A local-first macOS desktop app for tracking a personal portfolio of rental
apartments — their mortgages, leases, valuations and costs — and projecting value,
rent, cash flow and net worth over 30 years in both **nominal** and **real**
(inflation-adjusted) terms, with what-if scenario analysis, dev/phased mortgages, future-dated properties, an as-of snapshot lens, CSV import,
JSON backup/restore, Excel export, dark mode, and a multi-language UI.

- **Single user, fully offline.** All data stays on the Mac (SQLite file). No
  cloud, no auth, no telemetry.
- **Currency:** Czech koruna (CZK), locked (ADR 0058). The domain includes Czech specifics —
  annuity ("anuita") mortgages with **fixation periods** and rate **reset** at re-fix, the
  SVJ/fond-oprav building fund, and `daň z nemovitých věcí` (property tax).
- **Source of truth for behaviour:** this specification and the ADRs. The verified parity
  targets for the fictional sample portfolio in `.claude/rules/engine-parity.md` are the
  regression baseline (ADR 0081). Where a formula is in doubt, Czech banking practice
  decides, and a target changes only through an ADR and the target change log (ADR 0003).

## 2. Goals / non-goals

**Goals**

- Compute the current snapshot, 30-year projections, charts and KPIs to the parity
  targets within ±1 Kč (money) and ±0.0001 (ratios).
- Make data entry pleasant (forms + validation) instead of spreadsheet rows.
- Scenario analysis: named assumption overrides, time-aware shocks, side-by-side
  comparison, one-click stress presets.
- Be correct-by-construction: a pure, unit-tested engine decoupled from UI/storage.
- Support dev/phased mortgages (tranche draws + interest-only period), refinancing by
  successor blocks, and future-dated properties.
- Let the user view the portfolio on any date within the projection window (as-of lens).

**Non-goals (v1)**

- Multi-user, sync, or cloud. Multiple portfolios/entities. Bank/API integrations.
  Tax filing. Mobile. These may come later but are out of scope now.

## 3. Users & top tasks

Primary user: the portfolio owner (finance-literate, not a developer).

- See "where do I stand today" (net worth, LTV, cash flow, DSCR) at a glance.
- Add / edit a property, its mortgage(s), leases, valuations and costs.
- Read the 30-year projection per property and for the whole portfolio.
- Flip Nominal/Real; adjust assumptions and watch results update.
- Create and compare what-if scenarios; run stress tests.
- View the portfolio as it will stand on a future date.

## 4. The financial engine (the heart — pure, no UI, no IO)

All logic below lives in a standalone module (`src/engine`) with **no** imports from
React, Tauri, or the database (enforced by dependency-cruiser and ESLint). Inputs are plain
typed objects; outputs are plain typed objects. **Deterministic**: the base date is an
explicit input — never read the system clock inside the engine. **Money is never a float**
(see §8). Engine inputs are branded: dates are `IsoDate` (a `Date` at UTC midnight), rates
are `Rate` and Kč amounts are `Money` (both `Decimal`). Values get a brand only through the
constructors `isoDate`/`utc`, `rate` and `money` (ADR 0025, ADR 0074); outputs are plain
`Decimal`.

### 4.1 Inputs (domain model)

```
Assumptions {
  baseDate: IsoDate                // the owner-set "Projection start" (ADR 0019)
  appreciationPa: Rate             // default 0.04
  rentIndexationPa: Rate           // default 0.03
  vacancyAllowance: Rate           // default 0.05
  postFixationResetRatePa: Rate    // default 0.045
  horizonYears: int                // default 30
  inflationPa: Rate                // default 0.025  (CPI; drives real terms)
  acquisitionCostPct?: Rate        // 0–1 of the price; costs of a future buy with none
                                   // recorded (engine-only, ADR 0119)
  defaults: { propertyTaxYr, insuranceYr, mgmtPctRent, maintPctRent, svjMonthly, otherYr }
  // scenario-only shock overrides (not stored in the base assumptions table):
  inflationShock?: { deltaPa, durationYears }  // temporary CPI spike from baseDate, then revert
  rateShock?:      { deltaPa, durationYears }  // temporary reset-rate spike; the window starts
                                               // at each loan's own fixation end (ADR 0028),
                                               // a floating block's at baseDate (ADR 0162)
  valueShock?:     { pct, atYear }             // permanent value haircut from year N
}

Property { id, name, type?, sizeM2?, purchaseDate, purchasePrice,
           appreciationOverridePa?, rentIndexOverridePa?,
           active?: boolean,         // false ⇒ excluded from totals, projections, KPIs
           funding?: AcquisitionFunding }
           // address and garage are stored in the DB / CSV but not used by the engine

AcquisitionFunding { ownCash?, transactionCosts?, initialWorks?: Money, note? }
           // ADR 0119: each part unknown when blank (never 0); own cash = all own money
           // paid in at acquisition, costs and works included. Set, changed and cleared
           // in the property form; a CSV sets amounts but never clears one

MortgageDraw { date: IsoDate, amount: Money }     // additional principal tranche (> 0)
MortgagePrepayment { date, amount: Money, effect: "lowerInstalment" | "shortenTerm",
                     fee?: Money }               // extra principal repaid (> 0), ADR 0109
LoanRecast { date, maturity } | { date, instalment: Money }  // new maturity, ADR 0109

MortgageBlock = PlainLoan | DevelopmentLoan
  common: { id, propertyId, startDate, initialPrincipal, fixationYears,
            interestRatePa, monthlyInstalment,
            contractMaturityDate?,    // consistency check only (ADR 0029)
            prepayments?: MortgagePrepayment[],  // plain and development loans
            recasts?: LoanRecast[] }
  PlainLoan:       loanTermYears?      // optional; blank ⇒ term derived from the instalment
  DevelopmentLoan: loanTermYears       // required
                   draws?: MortgageDraw[]
                   completionDate?     // interest-only until this date
  // A block is a development loan when it has draws or a completionDate
  // (prepayments and recasts never make it one).

Valuation { id, propertyId, validFrom, validTo?, marketValue }   // effective-dated
Lease     { id, propertyId, startDate, endDate?,  monthlyRent }  // effective-dated
HoldingCost { id, propertyId, propertyTaxYr?, insuranceYr?, mgmtPctRent?,
              maintPctRent?, svjMonthly?, otherYr? }  // blank ⇒ Assumptions default

Portfolio { properties, mortgages, valuations, leases, holdingCosts }
           // dynamic 1..N properties; no fixed slots; no code change needed to add a property
```

Holding-cost fallback is **per field**, not per record: each `HoldingCost` field that is
blank/undefined falls back to the matching `Assumptions.defaults` value; non-blank fields
override. (The seed sets an explicit `svjMonthly` per property to exercise this.)

**Input validation.** Every engine entry point runs `validateInputs` and raises a typed
`EngineValidationError` instead of producing NaN, Infinity or an unbounded loop (ADR 0017,
ADR 0036). The codes: `INVALID_DATE`, `NON_FINITE_NUMBER`, `NEGATIVE_AMOUNT`,
`NEGATIVE_PRINCIPAL`, `RATE_OUT_OF_RANGE`, `INSTALMENT_BELOW_INTEREST`,
`ZERO_RATE_ZERO_INSTALMENT`, `MISSING_TERM_FOR_DEV_LOAN`, `NON_POSITIVE_DRAW`,
`DRAW_BEFORE_START`, `COMPLETION_BEFORE_START`, `DUPLICATE_BLOCK_START`, `END_BEFORE_START`,
`DUPLICATE_HOLDING_COST`, `ORPHAN_ROW`, `HORIZON_NOT_POSITIVE`, `INVALID_TERM`,
`SHOCK_OUT_OF_RANGE`, `GROWTH_OUT_OF_RANGE`, `SHOCKED_RATE_OUT_OF_RANGE`,
`SHOCKED_INFLATION_OUT_OF_RANGE`, `ASOF_BEFORE_BASEDATE`. Ranges (ADR 0038, ADR 0128):
interest 0–100 %, the post-fixation reset rate included; vacancy, cost shares, value haircut
and the acquisition cost rate 0–1 (ADR 0119); shock durations whole years ≥ 0; horizon a
whole number ≥ 1; growth, indexation, inflation and a property's growth overrides may be
negative but must be above −100 % (`GROWTH_OUT_OF_RANGE`); the reset rate plus a rate shock
stays within 0–100 % (`SHOCKED_RATE_OUT_OF_RANGE` on `rateShock`) and inflation plus an
inflation shock above −100 % (`SHOCKED_INFLATION_OUT_OF_RANGE` on `inflationShock`), checked
only when the level itself is valid; a value crash percentage must be finite. The funding
record's amounts must not be negative. The form, the CSV importer and backup restore reject
the same rows with a translated message (ADR 0037). A scenario is checked the same way when
it is saved: its overrides applied to the saved assumptions, counting only the fields it
sets. Saving the assumptions refuses an edit that newly breaks a saved scenario's shocked
level and names the scenario (ADR 0128). Restore only needs a scenario to be readable
(ADR 0123, §7).

**Whole-number bounds.** On top of the engine rules, every user-data entry point — the
forms, the CSV importer and backup restore — bounds the whole-number fields it takes
(ADR 0075, ADR 0076, ADR 0086; `src/lib/intRanges.ts`): projection horizon 1–100, fixation
0–50 years, loan term 1–50 years, property size 1–10 000 m². Restore reports a value outside
its range as `OUT_OF_RANGE` with the allowed range (a restore-only rule). It is a warning, not
a refusal: the confirm step lists it and asks "Restore anyway" (ADR 0148), so a backup the app
wrote does not fail on a bound alone. Above ten times the maximum a value stays a refusal
(`BEYOND_LIMIT`, ADR 0148). The engine (`HORIZON_NOT_POSITIVE`, `INVALID_TERM`) and the database
CHECK constraints have no upper bound, so a database that already holds an out-of-range value
still loads; the Data check lists it.

### 4.2 Derived per-mortgage-block values

- `fixationEnd = startDate + fixationYears*12 months` (EDATE). A 0-year (floating) block
  has no fixation end: it pays its entered rate on every payment due on or before baseDate
  and the reset rate after it (`rateFixedUntil`; a floating block that starts after
  baseDate pays the reset rate from its first payment). It never counts as an ended
  fixation, so it gets no refix warning (ADR 0162).
- `termMonths` — for plain loans without `loanTermYears`:
  `ceil(NPER(rate/12, -instalment, initialPrincipal))`. The **entered instalment is
  authoritative**; the term follows from it (ADR 0008). With `loanTermYears` set,
  `termMonths = loanTermYears * 12`. Development loans require `loanTermYears` and derive
  their instalment from it; the entered instalment is not used and is read-only in the form
  (ADR 0031).
- **Contract maturity check** (plain loans only): when `contractMaturityDate` is entered and
  the instalment-implied maturity differs from it by more than 1 month, the UI shows a
  warning. The term is not changed (ADR 0029).
- **One active block per property** (ADR 0027): the active block is the one whose
  `startDate` is the latest `≤ asOf`. A later block is a **successor** that replaces its
  predecessor from its start date (a refinance). Two blocks of one property with the same
  start date are rejected (`DUPLICATE_BLOCK_START`). A successor that starts before its
  predecessor's fixation end is allowed with a non-blocking warning (it may be a top-up).
- `currentBalance(asOf)` for the active block: FV over the loan's own payments due by `asOf`
  (due dates `EDATE(startDate, k)`), floored at 0. Blocks with `startDate > asOf` are
  _future_; `balance ≤ 0` ⇒ _closed_.

### 4.3 Snapshot (the as-of lens)

`propertySnapshot(property, portfolio, assumptions, asOf?)` and `portfolioSnapshot` accept
an explicit `asOf` date; it defaults to `assumptions.baseDate`. An `asOf` before `baseDate`
raises `ASOF_BEFORE_BASEDATE` (ADR 0019): earlier dates are reached by moving the Projection
start in Settings → Assumptions. The UI's **As-of** picker is bounded to
`[baseDate, baseDate + horizonYears]` and defaults to today moved into that window. One resolver
(`resolveAsOf`, ADR 0150) moves the picked date, or today, into that window on every read, so
a stale value after a baseDate or horizon change never shows: the engine call, the picker
text, the Today pill and the page subtitles all use the resolved date. Today counts as today
only when the resolved date is today (a future baseDate shows the baseDate, dated). A date
less than six months after baseDate shows the effective-dated snapshot; a later one shows a
projection-year row on Dashboard, Property detail and, at Today, Properties (D-62, ADR 0150),
so the tiles agree with the charts. The row is the **nearest whole year** on the baseDate
grid: `n = round(gridMonths(baseDate, asOf) / 12)`, counting months on the D-21 month-end
grid (`lastGridMonthOnOrBefore`), as value growth and the CPI index do. With baseDate 1 Jan
2026, an as-of of 1 Aug 2026 (7 months) shows year 1 and 1 Jul 2028 (30 months) shows year
3; with baseDate 31 Aug 2026, 28 Feb 2027 is 6 grid months and shows year 1. When `n` is 0
the tiles show the effective-dated snapshot at `asOf` (deflated by the CPI index under the
Real lens) (`src/ui/model/dashboard.ts` `asOfView`, `tilesForAsOf`). In a projection year a
property counts as owned when its purchase date is on or before that year's end.

Labels name that basis (ADR 0088, `asOfView`): a projection year reads "projection year
Y5 · 2031" with the Projections table's period, and the monthly block becomes "Monthly
equivalent … (annual projection ÷ 12)"; Today keeps "current" with the hint "annualised run
rate ÷ 12, leases in force on {date}"; any other date says "records in force on {date}". The
As-of picker shows the mapping under the date (none at Today). The horizon tile names the
last projection year ("Net worth in 2056 (30-yr horizon)") and does not follow the as-of date.

Selectors follow a consistent rule: "record in force at `asOf`" = latest `startDate/validFrom
≤ asOf` whose optional `endDate/validTo` is blank or `≥ asOf`. **Valuations** differ: the
governing valuation is the latest one with `validFrom ≤ asOf`, and its `validTo` is not read
(a value does not expire; the next valuation replaces it, ADR 0122). Before the first
valuation date, the nearest upcoming record is used (so year 0 lines up with the projection).
**Leases** have no such fallback (DR-045): snapshot rent is the contractual monthly rent of the lease in force at
`asOf` × 12, unindexed, and 0 when no lease is in force — before the first lease, in a gap
between leases (a one-day gap is rent-free) and after the last lease's end date. The
projection treats rent differently (§4.5). **Leases of one property never overlap**
(ADR 0163): adding a lease ends the open-ended lease before it on the day before the new
start, and a lease write or CSV import that would put two leases in force on one day is
refused (`LEASE_OVERLAP`). A database from before the rule may still hold an overlap; it
loads, and the Data check lists it.

Derived per-property values:

- **Current value** — governing valuation's `marketValue`, grown from its anchor by **whole
  completed months ÷ 12** at the appreciation rate (ADR 0032). The anchor is the baseDate,
  a later valuation's `validFrom`, or the purchase date of a property bought after baseDate.
  Months are counted with the month-end rule, so a 29 Feb baseDate still counts a full year
  (D-45). A valuation that started on or before baseDate is anchored at baseDate, not at its
  `validFrom`, so its value is not grown for the months before baseDate.
  Falls back to `purchasePrice` only when the property has no valuation (ADR 0122). For dev
  loans the completed value is scaled by `drawnFraction` (cumulative principal drawn ÷ total
  scheduled principal), so value ramps with construction progress.
- **Outstanding debt** — the property's schedule balance at `asOf` (refinance chain,
  fixation resets, prepayments and recasts included); the instalment and rate are the
  schedule's at that month.
- **Monthly rent** — lease in force at `asOf`; **gross annual** = ×12.
- **Effective gross** = gross × (1 − vacancy).
- **Holding costs** = `fixed + variable`, where
  `fixed = tax + insurance + svjMonthly*12 + other` (each blank ⇒ default) and
  `variable = (mgmtPct + maintPct) * grossAnnualRent`.
- **NOI** = effective gross − holding.
- **Debt service (annual)** = 12 × active monthly instalment.
- **Net cash flow** = NOI − debt service.
- **Equity** = value − debt. **LTV** = debt ÷ value (null, shown "n/a", when the value is 0
  and debt is owed; 0 when both are 0; ADR 0133).
- **Gross yield** = grossAnnual ÷ value. **Net yield (cap rate)** = NOI ÷ value. Both are
  null ("n/a") when the value is 0 (ADR 0133).
- **DSCR** = NOI ÷ debt service (null when debt service = 0; displayed as ">99×" above 99,
  ADR 0035).
- Portfolio = sums across **active** properties owned at `asOf`; portfolio **LTV** =
  Σdebt ÷ Σvalue; **DSCR** = ΣNOI ÷ Σdebt service; **weighted-avg rate** =
  Σ(balance×rate) ÷ Σbalance. A property bought after `asOf` whose loan is already drawn
  (an off-plan loan drawn at contract) adds its **debt** to Σdebt (so equity, LTV and the
  weighted rate) but not its value, income or debt service (ADR 0165).
- **Real terms** of a snapshot divide money by the cumulative CPI index at `asOf`
  (`cpiAt`, ADR 0023); ratios are lens-invariant.

### 4.4 Monthly amortization (the engine within the engine)

Produce a month-by-month schedule per property from `baseDate` for `horizonYears*12`
months. Standard Czech **annuity**: constant instalment split into declining interest
and rising principal.

**Calendar** (ADR 0021). Schedule rows sit on the baseDate month grid
(`EDATE(baseDate, m)`); interest per row = balance × annual rate ÷ 12 (a 30/360-style
simplification; the loan's payment day is not modelled, see §10). The **rate in effect and
the count of elapsed payments are keyed on each loan's own due dates** `EDATE(startDate, k)`:
the payment due on the fixation-end date is still at the fixed rate; the reset applies from
the next payment. Each row carries both dates: `date` (the grid date the projection buckets
by) and `dueDate`, the due date `EDATE(startDate, p)` of the payment it holds on the paying
block (ADR 0164). `dueDate` is null when no payment is due: an undrawn month, the draw row,
a repaid loan, or a refinance handover row the successor's draw replaces (unless it pays a handover prepayment: then the owner's due date). The amortization
table and its export show `dueDate`.

**Plain loans** — for each row with previous balance `B`:

- **Rate in effect**: the block's `interestRatePa` until its fixation end (a floating
  block: until baseDate or its later start, ADR 0162), then
  `postFixationResetRatePa`. (Monthly rate = annual/12.) A `rateShock` raises the reset
  rate by `deltaPa` for `durationYears` from each loan's own fixation end, then reverts
  (ADR 0028); a floating block's window starts at baseDate or its later start.
- **Instalment**: the entered instalment until the reset; at the reset re-amortize
  `instalment = PMT(reset/12, remainingPayments, -B)` and hold it thereafter
  (constant-maturity refix). The instalment is **not rounded** (ADR 0020).
- `interest = B * rateMonthly` (0 if `B ≤ 0`).
- `principal = min(B, instalment − interest)` (floored at 0).
- `newBalance = max(0, B − principal)`.
- **Maturity**: the payment whose number equals the term pays the whole outstanding
  balance — no post-payoff "dust", and a loan whose instalment cannot retire it pays the
  residual as a final balloon (D-40, in ADR 0021).
- **Expired fixation without a successor** (fixation ended before baseDate and no later
  block): the opening balance is replayed on the loan's own due dates with the reset applied
  from the true fixation end, and the UI warns the owner to enter the refix terms as a new
  block (ADR 0030). The warning also shows, "from … until …", when the next block starts
  on or after the due date of the first payment following the fixation end, so at least
  one payment runs at the reset rate (ADR 0129).
- **Loan starting after baseDate**: opening balance 0; the loan appears as new debt in the
  grid month it is drawn (ADR 0033).
- **Refinance handover** (successor block, D-47 in ADR 0027): the successor draws in the
  first grid month on/after its start. Predecessor payments due on or before that start are
  still paid (one falling in the draw month is carried by the draw row); later ones are
  dropped. Net refinance cash (successor principal − predecessor balance paid off) counts in
  the handover year's cash to owner and levered IRR, like an acquisition outflow.
  The handover row holds the successor's principal less the balance it pays off as
  `refinanced`, apart from `drawn` (ADR 0130); a tranche the successor draws in that month
  stays in `drawn`.

**Prepayments and recasts** (ADR 0109), on plain and development loans:

- Each event follows the **first payment due on or after its date**, counted on the loan's
  own due dates, so moving baseDate does not move it. The one exception (ADR 0116) is an
  event dated after the last payment due on or before baseDate and on or before baseDate
  itself: it settles right after that payment, so its placement depends on baseDate by less
  than one period. Its balance checks (prepayment clamp, the bank's `NPER`, recast checks)
  count the development-loan tranches of that window dated on or before it; the tranche
  itself still joins grid month 1 (ADR 0129). Within one payment period the order is:
  scheduled payment, then prepayments (date order), then recast. A prepayment dated
  between two due dates waits for the next one (interest is overstated by under a month).
- The schedule carries the loan's **maturity in force**: the contract term until an event
  moves it. Every re-amortization (a reset, a shock revert, a tranche, completion) runs
  over the payments left to it.
- **Prepayment**: `applied = min(amount, B)` is subtracted after the payment (row column
  `prepaid`; the fee is in `prepaymentFee`). Effect of the period's last prepayment, once:
  `lowerInstalment` re-amortizes from the next payment to the same maturity;
  `shortenTerm` keeps the instalment and sets the maturity to the payment plus
  `ceil(NPER)` at its rate. During interest-only both effects are the same.
- **Recast**: to a `maturity`, the last payment becomes the last one due on or before it
  and the next payment re-amortizes; to an `instalment`, the next payment pays exactly that
  and the maturity follows from `ceil(NPER)` at that payment's rate. The maturity is capped
  at the later of loan start + 50 years and the contract term; an instalment past the cap
  re-amortizes to the cap. An instalment that does not cover the next interest is ignored.
  An instalment recast before a development loan's completion is rejected, and so is a
  maturity on or before the payment the completion lands on.
- A tranche landing on or after the maturity in force's payment restores the contract term.
- Events dated on/before baseDate are **replayed** into the opening balance (the loan is
  simulated on its own due dates) and are not in the projection's cash flows.
- An event that meets a smaller balance (or a repaid loan) is clamped and **reported** as an
  event outcome, never raised. Events dated after a successor block's start are dropped and
  reported; a prepayment the handover drops is paid at the handover, before the successor
  pays off the rest.
- Row identity: `endBalance = previous − principal − prepaid + drawn + refinanced`
  (`refinanced` is non-zero only on a refinance handover row, ADR 0130).

**Dev/phased loans** — additional rules applied before the plain path:

- While the payment's due date `EDATE(start, p)` ≤ `completionDate`: **interest-only** —
  no principal, instalment = interest. Like the rate, it is read on the due date, not the
  grid date (ADR 0129).
- Each `MortgageDraw` tranche adds its `amount` to the balance **in the grid month it
  lands**, and the instalment re-amortizes in that month over the term remaining to
  `startDate + loanTermYears` (ADR 0024). After `completionDate` the fully drawn balance
  re-amortizes the same way. The trigger fires only on a real draw or completion.
- A tranche must be dated strictly after the loan start (`DRAW_BEFORE_START`; money drawn on
  the start date belongs in the initial principal, D-42), and on or before the last-but-one
  payment `EDATE(start, term·12 − 1)` (`DRAW_AFTER_SCHEDULE_END`, ADR 0129). A tranche
  between the last payment due by baseDate and baseDate joins grid month 1 and is part of
  the baseDate debt (D-41); one dated after baseDate within grid month 1 is new debt in that
  month (D-44). A tranche landing in a future loan's first draw month joins that draw
  (D-46).
- During construction the property's market value is scaled by `drawnFraction` (see §4.3).

Aggregate monthly interest / principal / debt-service / draws / prepaid / prepayment fees /
year-end balance for the annual projection. Prepaid principal and its fees are owner cash
outside debt service, net cash flow and DSCR (ADR 0109).

### 4.5 Annual projection (Year 0 … horizon)

Year 0 is the **opening position** at baseDate: stocks only (value, debt, equity, LTV);
flows zero. Each row carries `year` (0…horizon), `calendarYear` and its period
`(periodStart, periodEnd]`; the UI labels years with both, e.g. "Y5 · 2031" (ADR 0022).

**Future-dated properties** (`purchaseDate > baseDate`): the property is not yet owned
(`owned = false`) and does not appear in year-0 totals. It turns on in the year it is
acquired, with partial-year pro-rating (`activeMonthsInYear`). Rent gates separately on the
effective lease date, so a unit can be owned-but-not-yet-let. In the acquisition year, a
**down-payment outflow** is subtracted from net cash flow for levered IRR / cash-to-owner
purposes (ADR 0119):

- the recorded **own cash**, when the funding record has it;
- otherwise purchase price − acquisition loan + costs + works. Costs are the recorded
  transaction costs, else `acquisitionCostPct · price`, else 0; works are the recorded
  initial works, else 0. The price is used, not the valuation: a valuation above the price
  shows as equity the owner did not pay for.

The **acquisition loan** is the property's earliest block when it starts no later than 90
days after the purchase date (an earlier start counts: an off-plan loan drawn before
handover). It counts its initial principal and every tranche dated on or before the start
of the block that replaces it (the schedule's cut, D-47). A later block is a successor,
never the acquisition loan. A future buy's first loan that starts after the window is not
the acquisition loan: its initial principal is **cash in** in the projection year it is
drawn, like refinance cash; its tranches are not. The same holds for a property owned at
baseDate whose first loan is drawn after baseDate (ADR 0134): its equity at baseDate holds
the whole value, so the loan's initial principal is cash in, in its draw year. **Sources
and uses** (the Property detail Acquisition section, §9; never a blocker): uses = price +
recorded costs + recorded works; sources = own cash + acquisition loan; gap = uses −
sources, only while own cash is known. A gap of 1 Kč or more either way is shown as a
warning; a smaller one is rounding. A funding record on a property bought on or before
baseDate changes no figure.

**Debt service before the purchase** (ADR 0124): a future buy's loan can start before its
purchase date (an off-plan loan drawn at contract). Its schedule runs from its own start, while
the property's rows before the turn-on year stay empty. In years 1 … min(tStart − 1, N) the
schedule's interest, principal, prepaid and prepayment fees are **owner cash out**, booked in
the year paid, beside the down payment (for cumulative cash flow and levered IRR). Tranches
drawn in those years are the bank's money, not cash; the balance arrives as the turn-on year's
draw (DR-092). The turn-on year's row already holds all twelve schedule months. A property
bought after the horizon pays every in-window instalment but never enters equity. The
principal the acquisition loan repaid before baseDate (drawn by baseDate − its balance at
baseDate) is charged with the down payment in the turn-on year, when that loan is still the
block in force at baseDate; a successor already in force at baseDate is not traced
(ADR 0134).

**Deactivated properties** (`active = false`) are excluded from all projection rows and KPIs.

For each year _t ≥ 1_ and active property (growth rate `g` = override or default
appreciation; rent index `idx` likewise):

- `value_t` = value grown from its anchor by whole months ÷ 12 (the same function as the
  snapshot, ADR 0032); for a baseDate anchor this is `V0 * (1+g)^t`. A
  `valueShock { pct, atYear }` permanently reduces the value from year `atYear` onward
  (growth resumes off the lower base).
- `gross_t` = Σ of the year's monthly rents, lease by lease (see **Projected rent** below);
  `effective_t = gross_t × (1−vacancy)`
- `holding_t = fixed0 * CPI_t + (mgmtPct+maintPct) * gross_t`, where `CPI_t` is the
  cumulative per-year index (honours any `inflationShock`: spike, then revert). `fixed0`
  is at base-date prices for every property: a future purchase's fixed costs inflate from
  the base date, not from its purchase year, pro-rated by the months owned in its turn-on
  year (ADR 0165).
- `NOI_t = effective_t − holding_t`
- `interest_t / principal_t / debtService_t / draws_t / balance_t` from the monthly schedule;
  `balance_t = balance_{t−1} − principal_t + draws_t`.
- `acquiredValue_t` = a future purchase's value at its purchase date in its turn-on year,
  else 0 (ADR 0165). The Dashboard's equity-change chart shows it as **Purchases**, apart
  from appreciation (shown only when some year has one).
- `netCashFlow_t = NOI_t − debtService_t`
- `equity_t = value_t − balance_t`; `LTV_t = balance_t / value_t` (null when
  `value_t = 0 < balance_t`, 0 when both are 0; ADR 0133);
  `DSCR_t = NOI_t / debtService_t` (null when debtService_t = 0; display cap ">99×")
- **Mortgage rate in effect** for the year (steps to reset after fixation end)
- Portfolio = Σ across active properties; ratios from totals.
- **Real terms**: `real_t = nominal_t / CPI_t` (deflate to base-date money with the same
  cumulative index, ADR 0023). LTV and DSCR are ratios — identical nominal and real.

**Projected rent** follows the leases month by month (ADR 0080; `src/engine/projections.ts`
`buildRentPlan`, `computeRentAndCosts`). Projection year _t_ covers grid months
`12(t−1)+1 … 12t`; grid month _m_ is dated `EDATE(baseDate, m)`.

- Each grid month from the basis date on (baseDate, or the purchase date of a property bought
  later) takes the rent of the lease in force on its grid date (§4.3 rule). No lease in force
  ⇒ no rent that month: months before the first lease and gaps between leases earn nothing.
- The **last lease** (latest start date) keeps renting past its end date — it is treated as
  renewed — unless it ended before the basis date. Only a gap between two leases is empty.
- Each lease is indexed from its own turn-on year:
  `monthly_t = monthlyRent × (1+idx)^(t − t₀)`, where `t₀` = 0 for a lease in force at the
  basis date, else the projection year whose slice contains the lease's start (its first
  grid month on/after the start date).
- `gross_t` = Σ over the year's 12 grid months of that month's `monthly_t`.

_Example_ (baseDate 1 Jan 2026, `idx` = 3 %, vacancy ignored): lease A 20 000 Kč/month,
started 2025, ends 30 Jun 2026; lease B 22 000 Kč/month runs 1 Aug 2026 – 31 Jul 2027 and
is the last lease. Year 1's grid dates are 1 Feb 2026 … 1 Jan 2027.

| Grid dates (year 1)     | Lease in force | Months | `t₀` | Rent                            |
| ----------------------- | -------------- | -----: | ---: | ------------------------------- |
| 1 Feb – 1 Jun 2026      | A              |      5 |    0 | 5 × 20 000 × 1.03¹ = 103 000 Kč |
| 1 Jul 2026              | — (gap)        |      1 |    — | 0 Kč                            |
| 1 Aug 2026 – 1 Jan 2027 | B              |      6 |    1 | 6 × 22 000 × 1.03⁰ = 132 000 Kč |
| **Year 1 gross**        |                |     12 |      | **235 000 Kč**                  |

In year 2 (1 Feb 2027 … 1 Jan 2028) lease B is renewed past 31 Jul 2027 for all 12 months:
12 × 22 000 × 1.03¹ = 271 920 Kč.

The snapshot (§4.3) and the projection differ: the snapshot reads the lease in force on the
exact `asOf` date, unindexed, and gives 0 after the last lease's end; the projection reads
the lease on each grid date, indexes it, and renews the last lease. Both give no rent in a
gap between leases and neither falls back to an upcoming lease.

**Invariants:** `propertySnapshot(asOf = baseDate + N years)` == projection year N (value,
debt) for every property; when every loan retires within the horizon (as in the seed),
Σ principal repaid equals the starting debt plus later draws.

### 4.6 Portfolio KPIs

- Net worth at horizon (nominal & real); net-worth **multiple** = equityₙ/equity₀;
  **CAGR** nominal = (equityₙ/equity₀)^(1/horizon) − 1; **CAGR real** from the CPI-deflated
  net worth (equal to (1+CAGRₙ)/(1+infl) − 1 under constant inflation). CAGR is **null**
  when equity₀ ≤ 0 or its end net worth ≤ 0, and the tile shows "—" (ADR 0034, 0126).
  **Real multiple** = net worth realₙ / equity₀ (CPI₀ = 1, so equity₀ is already in
  base-date Kč; ADR 0087). Both multiples are **null** when equity₀ ≤ 0 (no growth base,
  shown "—"); with equity₀ > 0 a multiple keeps its sign (ADR 0126).
- **Cumulative cash to owner** (Years 1…N; ADR 0161) — net cash flow net of acquisition
  outflows, refinance cash, prepayments with their fees (ADR 0109) and debt service paid
  before a future purchase (ADR 0124): Σ_{t=1..N} cashToOwner_t, where cashToOwner_t =
  netCF_t − cashOutside_t and cashOutside_t = acquisition outflow_t − net refinance
  cash_t + prepaid_t + prepayment fees_t + pre-purchase debt service_t
  (`cashOutsideNetCf` in `src/engine/ownerCash.ts`). The acquisition outflow is the
  down payment plus the principal repaid before baseDate (ADR 0134), less a later first
  loan's initial principal, which is cash in (§4.5). Each projection year carries
  `cashToOwner` (year 0 = 0); a property's row carries its own share, and the portfolio
  row is Σ netCF_t − the portfolio's cashOutside_t. The projection grid and its Excel
  export (Projections page and property page) show it as "Cash to owner" after "Net CF",
  so Σ of the portfolio column is the tile.
  **Real** cumulative cash to owner = Σ_{t=1..N} cashToOwner_t / CPI_t:
  each year is deflated by its own index, as in the real IRR (ADR 0087). The Dashboard and
  Scenario compare show the multiple and the cumulative cash to owner of the lens; Σ principal
  repaid stays nominal and is labelled "(nominal)" in the Real lens.
- First calendar year net cash flow turns positive; first year from which portfolio debt
  stays 0 through year N (null while debt is owed at N; ADR 0126) — each reported with its
  projection year (ADR 0022).
- **Levered IRR** (nominal & real): IRR of the vector `[−equity₀, netCF₁, …, netCF_{N−1},
netCF_N + equity_N]` — acquisition outflows, refinance cash, prepayments with their
  fees and debt service paid before a future purchase (ADR 0124) adjust the relevant year's entry; terminal = projected equity at horizon. Real IRR deflates each entry by `CPI_t`.
  Computed by bisection on the decimal NPV (tolerance |NPV| < 1e-9 Kč, at most 200
  iterations) over the domain **−90 % … +1000 %** a year (ADR 0079; `src/engine/kpis.ts`
  `irrResult`, `src/engine/constants.ts`). The search starts with −90 % … +100 % and, when
  that brackets no sign change, widens the upper bound to +200 %, +400 %, +800 % and
  +1000 %. A bracket end with |NPV| < 1e-9 Kč is the IRR (ADR 0121, #185).
  Uniqueness: with at most one sign change in the cash flows the NPV has at most
  one root (Descartes' rule of signs), so no check is needed; with more than one, the NPV's
  sign is scanned over a rate grid across the domain (`IRR_SCAN_GRID`) and more than one
  root on the grid (a sign change between points, or a run of points with |NPV| < 1e-9 Kč)
  gives no IRR with reason **`NOT_UNIQUE`**. When no bracket holds a root the reason is
  **`NO_ROOT`**. In either case the IRR is null and the UI shows "n/a" with
  the reason: "No unique IRR: the cash flows break even at more than one rate" or "No IRR
  between −90 % and +1000 %" (`src/ui/model/irr.ts`).
- `totalPrincipalRepaid` (sanity invariant): Σ principal repaid over the horizon, prepaid
  principal included, read from the schedules of the active properties (so it includes the
  years before a future purchase, ADR 0124); for the seed it equals the starting debt
  (tripwire for the classic zero-principal spreadsheet bug).
- **Total interest** (ADR 0103): Σ projection interest of Years 1…N plus the interest paid
  before a future purchase (ADR 0124); the **real** figure is Σ interest_t / CPI_t, deflated
  like the real cumulative cash to owner.

### 4.7 Financing exposure and upcoming events (ADR 0103)

`financingExposure(portfolio, assumptions, schedules, asOf)` reads the same schedules as the
projection (`src/engine/financing.ts`). A loan is one active property's block chain.

- **Fixation end** = `blockEndDate`. Its payment is still fixed (D-21), so the **balance at
  fixation end** is the end balance of grid month `fixationYears·12 − paymentOffset`, and the
  reset row is the next one. A 0-year (floating) block has no fixation end (ADR 0162).
- Status at as-of, first match wins (ADR 0117): **replaced** (a successor starts on or before
  it, or in the same schedule month), **repaid** (no balance left by then), **passed** (on or
  before as-of, incl. ADR 0030), else **upcoming**. A loan's **next fixation** is its earliest
  upcoming one.
- **Debt resetting within N years** (`debtResettingWithin`) = Σ upcoming balances with the
  fixation end in (as-of, as-of + N years].
- **Payoff** = due date of the schedule's last payment (modelled, not the contract maturity);
  **remaining term** = the schedule's payments due after as-of (ADR 0117).
- **One property's loan** (`propertyLoanExposure`, ADR 0117) is the same view for the property
  page, active or not: its exposure, its chain blocks' resets and the ids of the chain blocks.
- **Upcoming events** (`upcomingEvents`) in (as-of, as-of + M months], sorted by date: fixation
  ends (with the balance), modelled payoffs, development completions, and the in-force
  lease's end when no later lease is entered.

## 5. Data layer

- **SQLite** on disk (one file in the app's data dir, see `docs/release.md`). Tables mirror
  §4.1 — one per entity, effective-dated where noted — plus a single-row `assumptions`
  table, a `scenarios` table (§7, overrides as versioned JSON + a name) and `app_meta`.
- CHECK constraints and unique natural keys back the §4.1 validation rules.
- Repositories (`src/data`) expose typed CRUD; the engine never imports the DB — the app
  loads rows, maps them to engine inputs through hand-rolled runtime guards (ADR 0048),
  calls the engine, renders outputs.
- Every multi-step write runs inside one transaction owned by a Rust command (ADR 0014).
- Migrations are versioned; before upgrading an existing database the app writes a verified
  `pre-migration-v<from>-to-v<to>-<stamp>.sqlite` copy to the `backups/` folder next to it.
  A migration that meets data breaking a new rule aborts and leaves the DB unchanged.
- The sample portfolio is seeded **only on first run**, recorded by a flag in `app_meta`;
  an empty portfolio later stays empty (ADR 0016).
- Errors are typed (`DataError` codes) and logged to a rotating local `app.log`.

## 6. CSV importer

Per-entity CSV import (`src/import/csv.ts` + `src/import/csvImport.ts`). CSV is the only
importer; the app has no dependency on any specific spreadsheet file. The user-facing guide,
with examples, is [docs/csv-import.md](docs/csv-import.md).

**Four importable entity types** (Assumptions are never imported — edited in the UI):

| File             | Key fields                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `properties.csv` | name, address, type, size_m2, garage, purchase_date, purchase_price, appreciation_override_pa, rent_index_override_pa, own_cash, transaction_costs, initial_works |
| `valuations.csv` | property_name (FK), valid_from, valid_to, market_value                                                                                                            |
| `rents.csv`      | property_name (FK), start_date, end_date, monthly_rent                                                                                                            |
| `mortgages.csv`  | property_name (FK), start_date, initial_principal, fixation_years, interest_rate_pa, monthly_instalment, loan_term_years, contract_maturity_date                  |

Note: `draws` and `completionDate` (dev/phased mortgage fields), prepayments, recasts and
the funding note (property form) are set via the UI, not CSV; a re-import keeps them.
Clearing a funding amount is a property form edit too: a blank CSV cell keeps it.

**Rules:**

- UTF-8, comma-delimited. A `;` delimiter, a decimal comma or Windows-1250 bytes (Czech
  Excel exports) are rejected with a precise message (ADR 0049).
- At most 2 MB and 5,000 data rows per file, checked before parsing (ADR 0053).
- Dates `YYYY-MM-DD` and real calendar dates; money plain decimal (no thousands separator,
  no exponent, not negative); rates as decimals in 0–1 (0.0169 = 1.69 %); integers whole and
  unsigned, within the form bounds — `fixation_years` 0–50, `loan_term_years` 1–50,
  `size_m2` 1–10 000 (ADR 0076); garage `true`/`false`, `yes`/`no` or `1`/`0`, in any
  case (an empty cell means not set).
- **Header row** ([guide](docs/csv-import.md#file-format)): header names are trimmed, then
  matched exactly and case-sensitively (lower case, as in the table above). Columns may come
  in any order and extra columns are ignored. A missing required column makes that cell
  _Required_ on every row. Every row must have as many cells as the header; empty lines are
  skipped and a leading byte-order mark is dropped.
- `property_name` matches a property after trimming, case-insensitively; the stored
  spelling is kept. Two names in one file differing only by case or spaces are a duplicate
  (fatal). An unknown name is fatal (D-55).
- Each row also passes the engine's `validateInputs` rules (§4.1) and the lease overlap
  rule (§4.3, ADR 0163).
- **All or nothing across the batch** ([guide](docs/csv-import.md#all-or-nothing)): every
  file chosen for one import is parsed, its property names resolved and the merged portfolio
  validated before anything is written. If any row in any file has an error, nothing is
  imported; errors name file, row and column. Fix and re-upload. The write is one
  transaction (ADR 0014), and a commit whose plan differs from the previewed one writes
  nothing (ADR 0096).
- **Upsert by natural key** ([guide](docs/csv-import.md#matching-and-updates)):
  re-importing updates rather than duplicating. Properties by name; children by
  `(property_name, start_date/valid_from)`. On an update, an empty
  `contract_maturity_date` keeps the stored date and an empty or missing `own_cash`,
  `transaction_costs` or `initial_works` column keeps the stored amount (ADR 0119; a new property
  gets them unknown); any other empty optional cell clears the stored value.
- Each file picker has a "Download template" button producing the header + one example row.
- Importing a new property automatically creates a default holding-costs row for it.
- Holding costs are **not** imported via CSV — set them via the UI on the property detail
  page after import.

**Architecture:** `csv.ts` is a pure parse/validate module (no DB, no React, no Tauri).
`csvImport.ts` handles FK resolution and the DB write. Unit-tested in `src/import/__tests__/`.

## 7. What-if / scenario analysis

A **Scenario** = a name + a set of overrides applied on top of `Assumptions`. The portfolio
data (properties/mortgages/etc.) is shared; only assumptions differ. The engine's
`applyScenario` function is pure and never mutates the underlying portfolio.

**Override types supported:**

- **Level overrides**: appreciation, rent indexation, inflation, vacancy, reset rate. A
  property's own appreciation / rent-indexation override (Properties form) takes precedence
  over a scenario's level, so the scenario does not change that property's rate (ADR 0102).
- **Temporary inflation shock** (`inflationShock`): raises inflation by `deltaPa` for
  `durationYears` years from baseDate, then reverts.
- **Temporary rate shock** (`rateShock`): raises the reset rate by `deltaPa` for
  `durationYears` years starting at **each loan's own fixation end** (ADR 0028); for a
  floating block, at baseDate or its later start (ADR 0162).
- **Permanent value shock** (`valueShock`): haircut property values by `pct` starting from
  year `atYear`; appreciation resumes off the lower base thereafter.

The scenario form groups these as **Permanent levels**, **Temporary shocks** and **One-off
price crash**, each with a legend and one line of help (ADR 0102).

**Workflow:**

- The "Base" scenario = the saved assumptions. Users create, edit, duplicate, and delete
  named scenarios (persisted in the `scenarios` table).
- **Rules (ADR 0123):** adding, saving and duplicating a scenario run the engine's
  assumption rules on its overrides applied to the saved assumptions, counting only the
  fields the scenario sets (vacancy and the value crash 0–100 %, shock years whole and
  ≥ 0, levels finite, growth levels above −100 %, the reset rate 0–100 %, and with a shock
  the shocked reset rate 0–100 % and shocked inflation above −100 %, ADR 0128). A refused
  save writes nothing and shows the rule on its field (a level, the value crash, a shock's
  delta) or above the buttons. Saving the assumptions refuses an edit that newly breaks a
  saved scenario's shocked level, naming the scenario on the level field; a scenario that
  broke the rule before the edit does not block it. A scenario that still breaks a rule (saved
  before this check, or restored) is left out of the compare and named in a notice above
  it. Restore only needs a scenario row to be readable, so every backup the app writes
  restores. A stored scenario row the app cannot read is left out at startup and listed
  with only a Delete; the rest of the app loads. The app never reads `created_at`; it only
  orders the list (DR-181).
- **Compare view**: pick 2–3 scenarios; show their KPIs and key charts side by side
  (net worth, net cash flow, LTV) on one screen, honouring the Nominal/Real lens. The
  Scenarios page currently hides the lens toggle (`showLens={false}` in
  `src/ui/pages/Scenarios.tsx`), so the comparison follows the lens last chosen on another
  page; showing the toggle there is tracked in #15.
  The key figures start with **starting equity** (projection year 0) and **Δ net worth vs
  Base** (horizon net worth minus Base's, in the lens; only when Base is compared). A
  scenario whose starting equity differs from Base's (a price crash at Today) has its
  multiple, CAGR and IRR marked with a footnote: those returns are measured from its lower
  starting equity, and Δ net worth shows the loss (ADR 0089).
  The ticked scenarios, the Base toggle and the price-crash timing last for the app session
  (in memory, like the lens): leaving the page and coming back keeps them. A deleted
  scenario leaves the selection (ADR 0101).
  An **Excel export** in the Key figures header saves the compare as
  `scenario-compare-<lens>.xlsx`: a Key figures sheet (one column per scenario, always the
  values, whatever the Values / Δ toggle shows) and one sheet each for net worth, net cash
  flow and LTV (year rows, one column per scenario), all in the lens. Money is whole Kč;
  the lens, the rebased-returns footnote and each n/a IRR's reason are note lines under the
  key figures (ADR 0108).
- **Stress presets** (one-click; each creates a named scenario,
  `src/ui/pages/ScenariosPanels.tsx`). Temporary shocks last `DEFAULT_SHOCK_YEARS` = 3
  years (`src/ui/model/scenarioForm.ts`), then revert to trend:
  - **Rate shock @ refix**: +2 / +4 / +6 pp for 3 years (`rateShock`).
  - **Inflation shock**: +3 / +6 / +9 pp for 3 years (`inflationShock`).
  - **Price crash**: −10 % / −20 % / −35 % of property value at Today / +5 years / +10 years
    (projection year 0, 5 or 10; `valueShock`, permanent). The timing is a "When" toggle
    (Start · +5y · +10y); each level button shows the timing it uses ("−20% @ +5y") and
    the preset name keeps that form (ADR 0101).
  - **Combined**: **Mild** = rates +2 pp for 3 years + price crash −10 %; **Severe** =
    rates +4 pp + inflation +3 pp, both for 3 years, + price crash −20 %. One click saves
    all parts in one scenario; the crash uses the "When" timing ("Mild @ +5y"), and the
    name lists the parts ("Mild: Rates +2pp for 3y · Price crash −10%") (ADR 0104).
  - The panel has a **Show / Hide presets** button. When the page opens it is collapsed if
    at least one scenario is saved, open otherwise; a manual Show or Hide wins for the app
    session (in memory). Collapsed, it shows a one-line summary (ADR 0106).

## 8. Non-functional requirements

- **Money precision:** compute money with `decimal.js` (the locked choice), persisted as
  TEXT decimal strings in SQLite. **No float arithmetic for currency.** Round only at display.
- **Display formats** (Czech accounting conventions; round only here, see `src/lib/format.ts`):
  money `#,##0 "Kč"`; millions `M Kč` on hero tiles / chart axes; percentages `0.0%`;
  multiples `0.00x`; dates `dd.mm.yyyy`; negatives shown red and in parentheses. Excel
  export writes the rounded values the app displays (ADR 0010).
- **Determinism:** engine is pure; base date is an input. Same inputs ⇒ same outputs.
- **Performance** (ADR 0066): budgets are benchmarked locally (`pnpm bench`) and measured in
  the release build (cold start to dashboard, edit to dashboard); 20 properties × 360 months
  × 30 years recompute well under a second; recompute on input change (memoized via
  `useEngine`).
- **Correctness:** engine covered by parity tests against the targets in
  `.claude/rules/engine-parity.md`, invariant and property-based tests, a golden master
  (ADR 0039) and nightly mutation testing (ADR 0026).
- **Privacy & security:** offline; no network calls, enforced by a strict Content Security
  Policy, least-privilege Tauri capabilities and a navigation guard. File dialogs and writes
  run in Rust; the webview never handles file paths (ADR 0064). Data, backup and log
  locations are listed in `docs/release.md`.
- **Platform:** Apple Silicon, macOS 13 or later; ad-hoc signed with the hardened runtime, no
  App Sandbox (ADR 0009, ADR 0063).
- **Internationalization:** UI strings in three languages — English (default), Czech, Russian
  (`src/i18n`). Number/date/currency formatting stays Czech-style regardless of language.
  Language is persisted and switchable at any time from the sidebar.
- **Theming:** light, dark, and system (follows OS) themes (`src/ui/theme.ts`); persisted to
  localStorage; applied before first paint to avoid a light-mode flash. Switchable from the
  sidebar.
- **Accessibility & UX:** keyboard-navigable forms, translated validation messages, WCAG 2.2
  AA basics checked by an axe scan per screen (`pnpm ux:capture`, ADR 0057), the accounting
  colour conventions (negatives red, etc.), macOS menu shortcuts (⌘N, ⌘1–⌘5, ⌘W
  hides the window).

## 9. Screens (UI)

The app uses a left sidebar (`AppShell.tsx`). Top-level nav items: **Dashboard, Properties,
Projections, Scenarios, Import, Settings, Guide**. The Nominal/Real lens toggle lives in the
topbar of pages that expose projections. The sidebar footer shows the engine base date, an
offline badge, and controls for language and theme.

1. **Dashboard** — hero KPI tiles (net worth today / at horizon, LTV, DSCR), nominal/real
   toggle, charts (value vs debt vs equity, equity change, net cash flow, LTV, etc.), KPI
   list, and a property filter. An **AsOfPicker** (Today / +1y / +5y presets, or any typed
   date within the projection window) sets the snapshot date (§4.3). A compact **Financing &
   upcoming** panel (§4.7, ADR 0103) shows the next rate reset, the debt resetting within
   1/3/5 years, total interest and the next 12 months' events, each linking to its property.
   The KPI list ends with **Cash invested** (ADR 0119 §9): the recorded own cash of the
   active properties in the filter, future buys included, shown only when every one of them
   has it; the real lens labels it nominal.
   A **Data check** panel (ADR 0118) lists, at the snapshot date, the inputs the engine
   falls back on: under "Needs attention" a valuation more than 12 months old, no valuation
   (purchase price used), a last lease that ended (no rent in the snapshot, renewed in the
   projection), no lease in force (rent 0), a lease ending within 3 months with no next
   lease, a fixation that ended with no follow-on block, and two stored leases that overlap
   (any date, ADR 0163); under "Using portfolio
   defaults" the portfolio growth, blank holding-cost fields and own cash at purchase not
   recorded (Cash invested unknown; for a property bought after the base date the down
   payment is derived, ADR 0119). Each row links to the property section (or form) that
   fixes it; the own-cash row opens the form with its Acquisition section open. The panel
   opens when something needs attention; a property not yet purchased has no findings
   except the own-cash one.

2. **Properties** — list with per-property summary and LTV/DSCR health bands, sorted by name in
   Czech order with numbers by value (every property list follows it, ADR 0127); "+ Add property"
   button opens a form modal (name, address, type, size_m2, garage, purchase_date,
   purchase_price, optional per-property growth overrides, and an optional collapsed
   **Acquisition** section: own cash, transaction costs, initial works and a funding note,
   where a blank amount is unknown and clearing every field clears the record, ADR 0119
   §9). Each row has Edit and Delete
   actions; a deactivated property shows an "Inactive" badge and one not yet purchased a
   "Pending" badge with its purchase date and "—" in every figure column (ADR 0156)
   (activate/deactivate is on Property detail). Delete cascades to all
   linked mortgages, valuations, leases, and holding costs (after confirmation).

3. **Property detail** — valuations, leases, mortgage blocks (including dev-loan tranche draws,
   completion date and the optional contract maturity date), holding costs (edit forms),
   30-year projection table + mini charts, amortization schedule (dated by each payment's
   due date, ADR 0164), and a health check
   (`amortizationHealth`, including the maturity and refix warnings). The **AsOfPicker** is
   available here too. Two **Excel export** buttons save the projection and amortization
   schedule as `.xlsx` files. A **Deactivate / Activate** action takes the property out of
   (or back into) all projections and KPIs (§4.5), after confirmation when deactivating.
   A deactivated property's page still shows its own figures as a preview and says so; it
   raises no loan warnings and has no Data check section (ADR 0155). A property not owned
   under the as-of basis (by the as-of date, or in a projection year by that year's end,
   ADR 0150) shows a "Not owned yet" panel (purchase date, price,
   acquisition loan) in place of the snapshot tiles; the projection charts stay (ADR 0156). When every property
   is deactivated, the Dashboard and Projections say so with a link to Properties, and
   Scenarios shows that note in place of the comparison (ADR 0155).
   The Financing section's **Loan outlook** (ADR 0116, ADR 0117) shows the modelled payoff,
   the remaining term and the interest prepayments save, then every loan block, oldest
   first, with its fixation end, the nominal balance at reset and a status: next rate reset,
   upcoming, passed, replaced by a later loan, repaid before the reset, or floating rate.
   The **Acquisition** section (ADR 0119 §9) lists the purchase price, transaction costs,
   initial works, uses, cash invested (own cash), the acquisition loan and sources, then the
   funding note; an unknown part reads "—" and no acquisition loan reads "None". A sources
   & uses gap of 1 Kč or more shows as a warning (short or over), never a blocker.
   A section nav lists Overview, Data check (the property's own findings, ADR 0118),
   Records, Financing, Acquisition, Holding costs, Projection and Amortization (ADR 0107).

4. **Projections** — full year-by-year grid (per property + portfolio), nominal/real toggle,
   and an **Excel export** of the projection table.

5. **Scenarios** — create, edit, duplicate, delete named scenarios; one-click stress presets;
   2–3-way compare view showing KPIs and charts side by side.

6. **Import** — four per-entity CSV file pickers (properties, valuations, rents, mortgages),
   each with a "Download template" button. Parse errors shown per row; import blocked on any
   error. Upserts on re-import.

7. **Settings** (tabbed, reached via sidebar or the native macOS menu):
   - **Assumptions** tab — editable global drivers (the dials), including the Projection
     start (`baseDate`).
   - **Backup / Restore** tab — Export writes the whole database to a versioned JSON file
     (`{ schemaVersion, exportedAt, tables: {...} }`) through a native save dialog; the file
     is written to a temporary name and moved into place. Restore opens a JSON backup (at
     most 20 MB), validates the schema version and every row (unknown columns, invalid
     values, whole-number values outside the form bounds, and scenario rows the app
     cannot read are refused before anything changes, ADR 0123), writes and verifies a
     safety backup first
     (ADR 0052), then replaces all tables in one transaction and reloads app state. The
     same transaction removes the sample markers, so restored data never shows as the
     sample (ADR 0127).
     The tab shows the date of the last successful export (or "No backup exported yet")
     and says to keep a copy off this Mac. A sidebar reminder appears when the data
     changed since then and there is no backup or it is over 30 days old (ADR 0110).

8. **Guide** — a static glossary / help screen (NOI, DSCR, LTV, fixation, annuity, etc.);
   no data entry.

## 10. Out of scope / future

Multiple portfolios, sharing, cloud sync, FX/multi-currency, transaction-level cash ledger,
tax modelling, mobile. Keep the engine and data model clean enough to add these later without
rewrites.

Czech mortgage features flagged but **not modelled** (ADR 0004), with design notes and a
build order in `docs/design/czech-mortgage-extensions.md`: the annual penalty-free
prepayment allowance, the loan's payment day, and first partial-month interest. One-off
prepayments and recasts are modelled (ADR 0109). Also backlog: auto-converting Czech-Excel CSV files (ADR 0049), a read-only history
view before the Projection start (ADR 0019), App Sandbox (ADR 0063).
