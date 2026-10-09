# 0119. Acquisition funding record

- Status: Accepted
- Date: 2026-10-04
- Source: issue #33 (pre-release review 2026-10, F1 + F2); code review 2026-10 issues #103,
  #140 and #118 (items 1–2)
- Amended: 2026-10-04 (independent review of PR #180: decision 3's tranche cut and decision
  5's late first loan, both decided by the owner); 2026-10-04 (#33 PR2: the CSV columns of
  decision 8, decided by the owner); 2026-10-04 (#33 PR3: the form section and the display of
  decision 9, decided by the owner)
- Amended by: ADR 0124 (debt service of a loan that runs before a future purchase date)
- Amended by: [0166](0166-development-committed-debt.md) (decision 5: the later tranches
  of such a loan are committed debt)

## Context

A property records its purchase price and date, and its loans are separate mortgage blocks.
Nothing records how the purchase was funded: how much of the owner's own money went in, what
the transaction cost, and what was spent on renovation or furnishing straight after the
purchase. So the app cannot answer "what did I put in?" separately from "what is my equity
worth today?".

For a property bought after baseDate (a future buy), the engine already derives a
down-payment outflow. It lands in the purchase year of the levered IRR and the cumulative net
cash flow. The outflow is the value at the purchase date, minus the initial principal of the
block selected at baseDate, plus value × `acquisitionCostPct`. The 2026-10 code review found
three problems with it:

- #103: for a development loan, only the initial principal is subtracted. The later tranches
  are paid by the bank, but the owner is charged them as own cash (a 10 M purchase with an
  8 M loan in three tranches costs the owner 8 M instead of 2 M).
- #140: `acquisitionCostPct` is engine-only (no column, form or mapper sets it), has no range
  bound, and has no written rule for how it relates to an entered cost.
- #118: before migration v10 adds columns, nothing forces the restore defaults map to follow
  a new NOT NULL column, and no test runs the real migration SQL on the SQLite version the app
  ships (3.46, bundled by sqlx).

The owner decided the open points on 2026-10-04. This ADR covers the whole of #33. The
engine and persistence ship first (#33 PR1); the CSV columns (PR2) and the form and Property
detail section (PR3) follow.

## Decision

1. **The record.** A property carries an optional funding record with four parts, each
   optional on its own:
   - `ownCash` (Money): every koruna of the owner's own money paid in at acquisition;
   - `transactionCosts` (Money): broker, legal, cadastre, valuation and similar fees;
   - `initialWorks` (Money): renovation or furnishing paid at or right after the purchase;
   - `note` (text).

   A missing part is **unknown**, never zero. Zero is a fact (for example, own cash 0 for a
   fully financed purchase). Existing properties start with every part unknown. Nothing is
   ever backfilled from today's value or today's debt.

2. **Own cash is all own money.** It covers the owner's share of the price, the costs and the
   works together. Transaction costs and initial works only break down what the money was
   used for. They are never added on top of own cash.
3. **Acquisition loan.** The loan that funded the purchase is derived, not entered. It is the
   property's **earliest** mortgage block, when that block starts no later than **90 days
   after the purchase date**. Any earlier start counts: an off-plan loan drawn before handover
   funded the purchase. Its amount is the initial principal plus every tranche dated on or
   before the start of the block that replaces it, the same cut the schedule makes (D-47); a
   tranche after that start is never drawn. A later block (a refinance or refix successor)
   is never the acquisition loan. When the earliest block starts more than 90 days after the purchase, or
   the property has no block, there is no acquisition loan.
4. **Sources and uses.** Uses = purchase price + transaction costs + initial works (the
   entered parts). Sources = own cash + acquisition loan. The gap = uses − sources: positive
   means the recorded sources do not cover the uses, negative means they exceed them. The
   gap exists only when own cash is known. It is a warning on the Property detail page, never
   a blocker.
5. **The down payment of a future buy.** For an active property bought after baseDate, the
   outflow booked in its turn-on year is:
   - own cash, when it is known;
   - otherwise purchase price − acquisition loan + costs + works, where costs are the entered
     transaction costs, else purchase price × `acquisitionCostPct`, else 0, and works are the
     entered initial works, else 0.

   The derivation now starts from the **purchase price**, not from the modelled value at the
   purchase date. The price is the cash that changes hands, so entering an own cash equal to
   the derived amount leaves every figure unchanged. A valuation above the price shows up as
   equity the owner did not pay for, which is the gain the valuation claims. The outflow is
   not clamped: a loan larger than every use gives a negative outflow (cash out), as before.

   A future buy's first loan that is **not** its acquisition loan (it starts more than 90
   days after the purchase, for example a loan that refinances own funds) pays its initial
   principal to the owner. That principal counts as **cash in**, in the projection year the
   loan is drawn, like the net cash of a refinance. Otherwise its debt would lower equity and
   its payments would lower net cash flow while the money itself never appeared. Its later
   tranches do not count as cash (the development value ramp, #120).

   For a property bought on or before baseDate, the record is information only. No figure
   changes when it is entered.

6. **`acquisitionCostPct` stays the engine-only fallback** of decision 5 (option D of #140,
   with option C's bound). It is a fraction of the purchase price, between 0 and 1. A value
   outside that range is rejected with `RATE_OUT_OF_RANGE`, like the vacancy allowance. The
   Czech real-estate acquisition tax was abolished in 2020, so typical costs today are fees.
7. **Validation.** Each amount must be a finite number (`NON_FINITE_NUMBER`) and not negative
   (`NEGATIVE_AMOUNT`). The errors name the fields `ownCash`, `transactionCosts` and
   `initialWorks`. The database checks the sign as well.
8. **Persistence.** Migration v10 adds four nullable columns to `properties`: `own_cash`,
   `transaction_costs` and `initial_works` (money as text, each with a not-negative check)
   and `funding_note`.
   - Backups include them. A backup written before v10 restores with the record unknown.
   - CSV: `properties.csv` takes the optional columns `own_cash`, `transaction_costs` and
     `initial_works`, in the same money format as `purchase_price` (a decimal point, a
     decimal comma is refused, ADR 0049; never negative; 0 is a fact). A blank cell or a
     missing column means unknown: a new property gets no amount, and a re-import keeps
     the stored amount. A CSV sets or changes an amount but never erases one. The note
     has no CSV column.
   - The property form sets, changes and clears each part: a blank amount is unknown, and
     a blank note (after trimming) is no note. Clearing every field clears the record. The
     form always saves the record it shows; a store edit that carries no record keeps the
     stored one.
9. **Display (PR3).** "Cash invested" is the own cash. Cash-on-cash return, a since-purchase
   IRR and a sale or disposal event stay out of scope (roadmap).
   - **Property form:** an optional Acquisition section with own cash, transaction costs,
     initial works and the note; nothing in it is required. It starts collapsed when adding
     a property, and when editing one with no record; it starts open when editing one with
     a record, and opens itself when one of its fields has an error. Its amount fields read
     "unknown" while blank.
   - **Property detail:** an Acquisition section after Financing lists the purchase price,
     transaction costs, initial works, uses, cash invested, acquisition loan and sources,
     then the recorded note. An unknown part reads "—"; no acquisition loan reads "None";
     sources read "—" while own cash is unknown. A gap of 1 Kč or more either way shows as
     a warning note (short or over), never a blocker; a smaller gap is rounding. Own cash 0
     gets no extra hint.
   - **Portfolio total:** the Dashboard's KPI list shows "Cash invested", the sum of own
     cash over the active properties in the Dashboard filter, future buys included. It is
     shown only when every one of them has a known own cash. It is a recorded nominal
     amount, so the real lens labels it nominal (as Σ principal, ADR 0087).

## Consequences

- **Parity targets do not change**: the sample portfolio has no future buy.
- **Golden master:** only the KPIs of the cases built on the mixed fixture's future buy move
  (price 6.0 M, valuation 6.3 M, a 4.2 M loan from the purchase date): its outflow drops from
  2.1 M to 1.8 M, and from 2.352 M to 2.04 M with a 4 % cost rate. Cumulative net cash flow
  and both levered IRRs change; the projection and schedule hashes do not.
- A future buy with a development loan is now charged its own money only (#103).
- A future buy whose first loan starts more than 90 days after the purchase is now charged
  the whole price plus costs in its turn-on year, and the loan's initial principal comes back
  as cash in the year it is drawn. Before, the loan reduced the down payment instead. When
  both fall in the same projection year, no figure changes.
- A development loan refinanced before its last tranche counts only the tranches drawn
  before the refinance.
- A recorded amount cannot be cleared by a CSV re-import; clearing it is a property form
  edit.
- Decided later: a first loan drawn after baseDate on a property already owned at
  baseDate brings its initial principal as cash in, as in §5 (#181, ADR 0134).
- Migration v10 is covered by a restore tripwire for added columns and by a Rust test that
  applies every migration's SQL on the bundled SQLite (#118 items 1–2).
- Decided later: debt service of a loan that runs before a future purchase date (#104) is
  owner cash in the years it is paid (ADR 0124).
- Not decided here: how a not-yet-owned property is shown and costed before its purchase
  (#126), exit costs and tax (#148), and the development value ramp (#120).
