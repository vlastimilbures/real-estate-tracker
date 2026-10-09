# 0167. Development loans: drawdown schedule editor and drawn/undrawn read-back

- Status: Proposed
- Date: 2026-10-09
- Source: issue #75 (follow-up deferred by ADR 0098); owner decisions 2026-10-09
- Amends: [0098](0098-mortgage-loan-type.md) (decision 5 and "Considered and deferred": the
  draws text area becomes a row editor; the initial principal of a development loan is
  shown as its first, start-date draw)
- Related: [0024](0024-draw-timing.md) (D-42: money drawn on the start date belongs in the
  initial principal), [0116](0116-prepayments-ui-and-review-fixes.md) (§11 row editor),
  [0166](0166-development-committed-debt.md) (committed debt),
  [0001](0001-behaviour-change-gate.md)

## Context

A development (construction) loan is entered as an **Initial principal** money field plus a
**Development draws** text area holding one `dd.mm.yyyy = amount` line per tranche. Users
cannot see that:

- the initial principal is only the amount drawn **on the start date**, not the whole loan;
- the whole loan is the initial principal plus every tranche;
- which tranches are already drawn at the date being viewed.

The help text explains the first two points in capitals ("ADDITIONAL tranches drawn AFTER
the start date"). The only total shown anywhere is an unlabelled "Σ" in the mortgage table.
A typo in one line rejects the whole text area with one message, and an engine error (for
example `DRAW_AFTER_SCHEDULE_END`) cannot say which line it means.

## Decision

1. **Drawdown schedule.** In Development mode the form shows one **Drawdown schedule**
   fieldset in place of the draws text area. It sits right after the start date.
   - The **first row is fixed**. It shows the loan start date (read-only, copied from the
     Start date field) and the initial principal, labelled **Drawn at start**. It is the same
     stored field, parser and error as before. It moves out of the main field grid only in
     Development mode.
   - Each **tranche row** has a Date and an Amount and a Remove button. **Add tranche**
     appends a blank row. Blank rows are ignored when saving.
   - A footer line shows **Total loan X Kč · N tranches after start**, updated as the user
     types (`aria-live="polite"`).
   - Standard mode is unchanged: Initial principal stays in the grid, and there is no
     drawdown block.
2. **Errors per row.** A row that does not parse is marked after a failed save, as in the
   prepayment rows (ADR 0116 §11). An engine error on a tranche (`DRAW_BEFORE_START`,
   `DRAW_AFTER_SCHEDULE_END`, `NON_POSITIVE_DRAW`, `INVALID_DATE`) shows on its own row.
   The form submits non-blank rows in the order shown. The engine does not depend on draw
   order, and the mapper keeps sorting stored draws by date.
3. **Soft warnings.** These do not block the save, and they change no engine rule:
   - a tranche dated after the interest-only end: "Drawn after the interest-only period
     ends; the loan re-amortizes again at this draw";
   - two tranches on the same date: "Same date as another tranche; the amounts are added
     together".
4. **Focus.** Add moves focus to the new row's date. Remove moves focus to the next row's
   date, or to the Add button when no row follows. This applies to the prepayment and recast
   rows as well. It closes the item deferred by the PR #100 review.
5. **Mortgage table.** The Development column reads "N tranches · Total loan X Kč" in place
   of the bare "Σ".
6. **Read-back (Loan outlook).** For a development loan, the property's Loan outlook shows a
   **Drawdown** section:
   - a bar and a sentence: "Drawn X of Y Kč (Z %)", or **Fully drawn**;
   - a table of every draw (the start draw first) with its date, amount and status.
     The status is an icon plus text, never colour alone: **Drawn** when its date is on or
     before the as-of date, **Not drawn yet** when it is later, and **Not drawn —
     replaced** when it is dated after a successor block's start (the same rule as
     committed debt, ADR 0166).
   - The as-of date is the page's as-of date, so the as-of control moves it.
     The statuses come from a pure engine function. The UI does not compare dates itself.
7. Stored data, CSV import, backup, the engine's schedule and every computed number are
   unchanged. All new text is translated in en, cs and ru.

### Considered and rejected

- **Enter the total loan and derive the start draw.** The form would store a number the user
  did not type, and an edit would have to keep the two in step. Rejected by the owner.
- **Hard error for a tranche after completion.** Real contracts sometimes draw a retention
  after handover. It is a warning only.

## Consequences

User-visible UI change under ADR 0001. No parity target, golden-master figure or stored
data changes. The engine gains one read-only output (the drawdown statuses) for the Loan
outlook.
