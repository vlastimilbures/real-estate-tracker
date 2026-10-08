# 0160. CSV import explains how it meets stored loan events

- Status: Proposed
- Date: 2026-10-08
- Source: issue #116 (2026-10 code review, findings G1-5-02, G1-5-01, G1-5-04, G1-5-12);
  owner decision D7 (2026-10-08: option A, all four items); Track 11 PR 11.11
- Amends: [0096](0096-csv-import-preview.md) (the preview also notes replaced loan events and
  blocks without effect; an add that replaces loan events asks for confirmation)
- Related: [0109](0109-loan-prepayments-and-recasts.md) (§9 a successor cuts its predecessor's
  later events; §12 a re-import keeps them), [0116](0116-prepayments-ui-and-review-fixes.md)

## Context

Prepayments, recasts and the draws of a development loan are entered only in the mortgage
form. A CSV re-import keeps them (ADR 0109 §12). That is correct, but the import did not say
how a CSV row meets these stored events:

1. **Wrong refusal.** When a CSV change makes a stored event invalid (for example a shorter
   `loan_term_years` puts a stored prepayment after the last payment), the import is refused
   as it should be. But the refusal named a column the CSV does not have (`prepayments`,
   `recasts`, `draws`), did not say which event, and told the owner to correct the CSV row.
2. **Silent replacement.** A mortgage row with a new `start_date` adds a block that replaces
   its predecessor from that date. The predecessor's prepayments and maturity changes dated
   after it stop applying. The preview said only "1 new", and an add-only plan imported on
   the first press.
3. **A block without effect.** A row whose `start_date` is earlier than the block in force at
   the base date (for example a corrected typo) adds a block the projection never uses. The
   preview showed a normal add.
4. **Guide.** `docs/csv-import.md` did not say that prepayments and recasts are kept on
   re-import, or why an import can be refused because of them.

## Decision

1. **Stored-event refusal.** When the merged data breaks an input rule on a block's
   prepayment, maturity change or draw, the refused-rows table names the event and its date
   and says to change it in the mortgage form first, for example: "The saved prepayment of
   17.01.2045 is no longer valid: it must be dated before the loan's last payment. Change or
   remove it in the property's mortgage form first, or keep the old value in the CSV." The
   field column shows "—", because the event is not a CSV column. Each event gets its own
   line. The engine's draw rules now report the draw's index, as prepayments and recasts
   already do.
2. **Replaced events in the preview.** For each added mortgage block that the projection
   uses, the plan finds the block it replaces (the previous block in the chain at the base
   date) and lists that block's prepayments and maturity changes dated after the new start
   and not already replaced by a later block. The preview shows them under the added row
   with the existing property-page wording ("the prepayment on 17.01.2032 falls after the
   next loan block takes over, so it is ignored"). An event dated on or before the new
   start still applies and is not listed (ADR 0109 §9). The import report shows the same
   lines.
3. **Confirmation.** A plan with such an add asks for confirmation like a plan with updates
   (ADR 0096 §4): the confirm row says how many added blocks replace saved loan events, and
   the button reads "Import anyway" when there are no updates (with updates it keeps
   "Overwrite N existing records"). Stored rows are not changed, so deleting the new block
   brings the events back.
4. **No-effect note.** An added mortgage block that starts before the block in force at the
   base date gets the note "Starts before the loan block in force, so it has no effect on the
   projection." It is a note only; the import is not blocked and asks for no confirmation.
5. **Guide.** `docs/csv-import.md` lists prepayments and recasts as kept on re-import and
   explains the three cases above.
6. Without a stored base date (an empty database) items 2–4 do not apply. Strings are added
   in en, cs and ru.

## Consequences

User-visible: new refusal wording for stored events, notes under added mortgage rows in the
preview and the report, and a confirmation step for adds that replace loan events. No
computed number, parity target or golden output changes. The plan fingerprint covers the new
notes, so the plan-change guard (ADR 0096 §5) also catches a stored event edited between the
preview and the import. The engine's `blockChain` is exported for the import plan; the
engine's input-rule errors for draws now carry an index. New ux-capture screens `53` and `54`.
