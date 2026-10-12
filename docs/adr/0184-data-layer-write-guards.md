# 0184. Data-layer write guards

- Status: Accepted
- Date: 2026-10-12
- Source: issue #144 (2026-10 review findings R6-11, G2-4-04, R6-13, R3-12; owner chose
  option B on 2026-10-12: narrow close-out only, no Rust row-count guard; extras guarded,
  not reloaded with the portfolio); Track 14 PR N5b
- Amends: [0099](0099-close-previous-open-record.md) (what ending the previous record
  writes), [0116](0116-prepayments-ui-and-review-fixes.md) decision 4 (unknown keys, now
  for draws too)
- Related: [0001](0001-behaviour-change-gate.md) (behaviour-change gate),
  [0014](0014-rust-transaction-command.md) (multi-statement writes),
  [0049](0049-czech-excel-csv.md) (D-55, CSV name matching)

## Context

Four small gaps in the write paths, found by the 2026-10 review (#144):

- The stored `draws` column of a mortgage is read by its own parser. It skipped the
  unknown-key check that ADR 0116 decision 4 gave prepayments and recasts, so a misspelt
  key in a draw was dropped without a word.
- Ending the previous open valuation or lease (ADR 0099) rewrote every column of that row
  from the copy the screen held when the prompt opened. A correction saved in between was
  silently reverted.
- A property write takes address and garage beside the engine fields (they are not engine
  inputs). `propertyToRow` defaulted them to nothing, which writes NULL. The edit form loads
  them with a second read and let Save run before that read returned, or after it failed:
  Save then erased the stored address and garage.
- The form's duplicate-name check lowercased names but did not trim them, while CSV import
  and restore match names with `propertyKey` (trimmed, case-insensitive; D-55).

## Decision

1. **Draws reject unknown keys.** A stored draw allows only `date` and `amount`; any other
   key makes the row invalid (`ROW_INVALID`, "draws has an unknown field …"), like a stored
   prepayment or recast. The app writes only these two keys, so only a hand-edited database
   is affected; the Data check reports such a row.
2. **Ending the previous record writes only its end date.** The close is
   `UPDATE valuations SET valid_to = ? WHERE id = ? AND valid_to IS NULL` (leases:
   `end_date`), in the same transaction as the new record. Every other column keeps what is
   stored. A predecessor that was closed meanwhile keeps its end date.
   Known limit: a predecessor deleted meanwhile is not reported; the statement changes no
   row and the new record is still added. The transaction command returns no row counts, and
   a guard for this is not worth a Rust change while the prompt is modal.
3. **Address and garage are always passed.** `propertyToRow` and the store's `addProperty`
   require them; there is no default. The edit form tracks their read: Save is disabled while
   it runs, and if it fails the form shows `propertyForm.errExtrasLoad` above the buttons and
   Save stays disabled. The add form needs no read.
4. **The form matches names like CSV.** The duplicate-name check compares `propertyKey` of
   both names, so a name that differs from another only by surrounding spaces or case is
   rejected.

## Consequences

- No computed number changes; golden master and parity targets are unchanged.
- A database with an unknown draws key, which only manual editing can make, now loads with
  that mortgage reported as invalid.
- The edit form cannot erase a stored address or garage; when their read fails, the owner
  closes the form and opens it again.
- The stale-copy close is safe if the prompt ever stops being modal; a deleted predecessor
  is still not reported (decision 2).
