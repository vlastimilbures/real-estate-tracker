# 0116. Prepayments: form, outputs and review fixes

- Status: Accepted
- Date: 2026-10-03
- Source: issue #32 (#32b); independent review of PR #91 (2026-10-03)
- Amends: [0109](0109-loan-prepayments-and-recasts.md)
- Amended: 2026-10-03 (#32b-2: how the form and the outputs show events, decisions 9 and 11)

## Context

ADR 0109 (#32a) added loan prepayments and recasts to the engine and the database, with no
form and no visible output. An independent review of PR #91 found two engine bugs, test
gaps and wording that does not match the code. #32b ships the form and the outputs, and it
fixes the review findings. #32a and #32b ship in the same release. The owner decided the
open points on 2026-10-03.

The work is split into two pull requests: #32b-1 (engine, data and docs) and #32b-2 (UI).
This ADR covers both.

## Decision

1. **Events in the late window (wording only).** Some events are dated after the loan's last
   payment due on or before baseDate, and on or before baseDate themselves. They are history,
   and they settle right after that last payment. Their placement therefore depends on
   baseDate by less than one payment period. ADR 0109 §3 and SPEC §4.4 now name this
   exception. The code is unchanged, and a test pins the rule.
2. **Tranche on the maturity payment.** A tranche that lands **on or after** the payment of
   the maturity in force restores the contract term. Before, a tranche on that exact payment
   was repaid in one shot.
3. **Handover fee.** A prepayment that the refinance handover drops is charged its own
   entered fee. Before, two prepayments with the same date and amount both got the first
   one's fee.
4. **Stored events reject unknown keys.** A stored prepayment allows only `date`, `amount`,
   `effect` and `fee`. A stored recast allows only `date`, `maturity` and `instalment`. Any
   other key makes the row invalid (`ROW_INVALID`), so a typo such as `fees` can't silently
   lose a fee. A hand-edited backup with extra keys no longer restores.
5. **Recast maturity message.** The message states the real limits: at most 50 years after
   the loan start, or the contract term when that is longer, and after a development loan's
   completion (decision 15).
6. **Snapshot instalment after a prepayment.** The as-of snapshot reports the instalment in
   force after a month's prepayment. When the snapshot month's row has a prepayment, the
   instalment comes from the next row, if that row is at the same rate and draws nothing;
   the rate stays the month's own. This matches the balance shown, which has already had
   the prepayment taken off. An interest-only month, a reset or a tranche in the next
   row, or a recast alone keeps today's behaviour.
7. **Rate-shock reach uses the modelled maturity.** The Scenarios note ("hits N of M loans")
   reads each block's last payment from the base schedule, after its prepayments and
   recasts. Before the fixation end the rates, and so the events, are the same with and
   without the shock, so the base schedule decides hit or miss exactly.
8. **The maturity check stays an input check.** The implied-maturity warning compares the
   entered term or instalment with the contract maturity date. It keeps reading the entered
   terms: events move the maturity on purpose, and warning about that would be noise. The
   property page shows the modelled payoff date next to it.
9. **Interest saved.** For each property with at least one prepayment, the engine computes
   interest saved as two sums of interest, from the first projection month to payoff. The
   first sum comes from the chain with **every** prepayment removed, the second from the
   chain as entered; the result is the first minus the second. It is null when there is no
   prepayment.
   - Recasts are kept on both sides.
   - Past prepayments count through the lower opening balance.
   - It covers the whole remaining life of each block, not just the projection horizon. It
     is nominal, uses the base-case assumptions, and is not net of fees.
   - It is shown on the property page and in the Dashboard financing panel, and it is never
     a KPI.
   - A successor's own interest does not change, because its principal is an input.
   - The property page shows the property's figure. The Dashboard financing panel shows
     the portfolio total and, in a disclosure, each property with a prepayment and its
     figure. It stays nominal in the real lens too, and it is labelled so.
   - The outcome keeps the entered fee internal. A warning shows the requested and the
     applied amounts; the Fee column shows the fee charged. The entered fee is in the form
     row (owner decision, 2026-10-03).
10. **Clamps are warnings, not rejections.** A clamped, ignored or dropped event (an event
    outcome with an issue) is shown as a loan warning on the property page. Saving is never
    rejected for it. This replaces "the form in #32b rejects these" in ADR 0109 §9: the
    balance depends on the assumptions, so a stored event could become clamped later anyway.
11. **The form edits the events.** The mortgage form has a row editor for each block, with
    prepayment rows (date, amount, effect, optional fee) and recast rows (date, then a new
    maturity or a new instalment). Saving the form replaces the stored events, which amends
    ADR 0109 §12. A CSV re-import still keeps them.
    - Validation issues on events carry the item's index, so an error shows on its row.
    - A stored event that an edit made invalid shows on its row and can be fixed or removed
      there.
    - The form submits its non-blank rows in the order shown; the engine sorts events by
      date itself. A validation `index` is the position in that submitted list, which the
      form maps back to its row. A blank row is ignored. A row that does not parse (a bad
      date or amount) blocks the save: the list shows the message and marks the bad cells.
      Editing a list clears its row errors until the next save, because rows can move.
    - An added row, even a blank one, marks the form as having unsaved changes.
    - A form opens with the stored events in date order (the order the database returns),
      so after a save the rows can come back re-sorted.
12. **New columns.** These columns are shown only when some row has a non-zero value, the
    same on screen and in the Excel export. The balance then reconciles in both views.
    - Amortization table: Prepaid, Prepayment fee, Drawn.
    - Projection grid: Prepaid, Prepayment fees, Draws.
13. **Snapshot fallback without a schedule.** The app always passes schedules, so this path is
    dead code (DR-118, on the roadmap). It still ignores events. A test pins today's output,
    and nothing else changes.
    - **Follow-up (DR-118, 2026-10-04):** the fallback is removed. A snapshot called
      without a schedule builds one from the same inputs, so every snapshot reads the
      schedule; no app number changed.

14. **Development loan completed just before baseDate.** The development grid opens with
    the interest-only status of the last payment made, not of baseDate. Before, a
    completion after the last payment due and on or before baseDate, with no tranche in
    grid month 1, lost its re-amortization (D-24). The loan stayed interest-only to
    maturity and repaid everything as a balloon. The extended property test found this,
    and the reference model already amortized. No events are needed to trigger it.
15. **A development loan's recast maturity falls after completion.** A maturity recast
    whose last payment is on or before the payment the completion lands on (the first due
    on or after the completion date) is rejected (`INVALID_RECAST_MATURITY`). The loan
    would end before it finishes drawing, or its last tranche would land on the maturity
    and restore the contract term (decision 2), silently undoing the recast. Before, the
    engine and the reference model disagreed on that input. Decision 2 still applies to a
    development loan with tranches but no completion date.

## Consequences

- No parity target or golden hash changes. The seed portfolio has no events, and the new
  output is not hashed.
- An engine case changes for a development loan whose tranche lands on the shortened
  maturity's payment (decision 2). A refinance handover with duplicate prepayments changes
  too (decision 3).
- The reference model follows decision 2. The cross-check now runs the reference over a
  fixed horizon and compares row counts.
- `ProjectionYear.principal` and `AmortizationRow.principal` are scheduled principal only.
  The KPI `totalPrincipalRepaid` adds prepaid on top.
