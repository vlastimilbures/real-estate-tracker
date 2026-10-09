# 0164. Amortization rows show the payment due date

- Status: Accepted
- Date: 2026-10-09
- Source: issue #112 (2026-10 code review, finding G2-6-01); owner decision D5 = A
  (2026-10-09); Track 11 PR 11.16
- Related: [0021](0021-schedule-calendar.md) (the base-date grid stays for the engine),
  [0117](0117-property-loan-outlook.md) (payoff = due date of the last payment),
  [0116](0116-prepayments-ui-and-review-fixes.md) §12 (amortization columns), [0109](0109-loan-prepayments-and-recasts.md)
  (a prepayment applies after the first payment due on or after its date)

## Context

The amortization table on Property detail and its Excel export showed a "Date" column. It
held the engine's grid date, `EDATE(baseDate, m)`, not the date the payment is due. The
payment in row `m` is payment `p = offset + m` of the paying block, due on
`EDATE(startDate, p)` (ADR 0021). Every row was therefore off by the gap in day of month
between `baseDate` and the loan start, from 0 to about 30 days.

For the Javorova seed (pays on the 17th, `baseDate` 2026-06-07) every row was 21 days late.
Payment 56, due on the fixation end 17.01.2031, showed as 07.02.2031. A prepayment the owner
typed as 17.01.2031 appeared in a row dated 07.02.2031. The Financing panel's payoff date
already used the real due date (a private helper in `financing.ts`), so the page disagreed
with itself on the last payment. No money figure was wrong.

Options: A, replace the date with the due date; B, add a "Due date" column next to the grid
date; C, a caption only. The owner chose A.

## Decision

1. **Each amortization row carries the due date of its payment.** `AmortizationRow` gets
   `dueDate: IsoDate | null`, set in both grids (plain and development) to
   `EDATE(paying block's startDate, p)`. It is `null` when the row carries no scheduled
   payment: an undrawn month, the draw row of a future loan or of a first development draw,
   a repaid loan's trailing rows, and a refinance handover row that the successor's draw
   replaces (unless that row pays the owner's handover prepayment, ADR 0109: it then falls due on the owner's date for that month, as the payoff did before). A handover row the owner still pays ([ADR 0138](0138-refinance-handover-edge-cases.md)) keeps the owner's due date; the
   rows after a handover fall due on the successor's own day.
2. **The grid date stays.** `date` is still `EDATE(baseDate, m)`, and the projection still
   buckets rows by it into years (D-22). Interest per row is unchanged.
3. **The table and the export show the due date.** The column is headed "Due date"
   (cs "Datum splatnosti", ru "Дата платежа"). A row with no due date shows "—" on screen
   and an empty cell in Excel.
4. **The Financing payoff reads the row.** `payoffDate` is the last payment row's `dueDate`.
   The private `dueDate` helper in `financing.ts` is removed. The payoff dates do not change.

## Consequences

- The table now matches bank statements, the dates the owner types for loan events, and the
  Financing panel's payoff date.
- No computed number moves. No parity target changes. `dueDate` joins the golden-master
  `ADDED_FIELDS`, so every hash is unchanged.
- One user-visible change: the amortization column header and its dates, on screen and in
  the export, in en, cs and ru.
- A per-loan payment day (`docs/design/czech-mortgage-extensions.md`, feature 3) is still
  open. The due date follows the loan start day until then.
- Tests: `due-date.test.ts` (probe G2-6-01 and the null cases), an invariant in
  `invariants.test.ts` (a row has a due date exactly when it pays, within its grid month),
  and the table and export tests.
