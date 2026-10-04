# 0125. A committed write whose reload fails is not a failure

- Status: Accepted
- Date: 2026-10-04
- Source: issue #106 (2026-10 code review: R7-01, G2-5-05)
- Related: [0014](0014-rust-transaction-command.md) (one transaction per write),
  [0052](0052-restore-safety-backup.md) (restore safety backup),
  [0094](0094-sample-portfolio-clear.md), [0095](0095-assumptions-save-row.md),
  [0096](0096-csv-import-preview.md), [0112](0112-load-sample-on-demand.md)
- Replaces: the "acknowledged, no-code-change behaviour" note on the store test (legacy
  DR-086 / UX-050)

## Context

Every write in the store runs the operation, marks the data as changed, then reloads the
data from the database for the screen. All three steps sat in one `try`, so a reload that
failed after the operation had committed was reported as a failed write:

- Restore, Clear sample, Load sample and CSV import rejected. Their pages then said the
  action "failed and was rolled back — your data is unchanged" (or "nothing was imported").
  That was false: the data had been replaced. After a restore or a clear, the name of the
  safety backup that undoes it was never shown.
- Forms got `{ ok: false }` with the raw read error and stayed open. A retry made a new id
  and was refused as a duplicate, while the stale table did not show the row. Form errors
  for a broken record (`ROW_INVALID`, `SCENARIO_INVALID`) also said "Nothing was changed".

The stale banner ("The change may not be shown yet: reloading the data failed. Reload to see
what is saved.") already appeared at the same time. PR #190 (ADR 0123) removed the likeliest
trigger, a scenario row the loader cannot read; any other reload failure after a commit was
still misreported.

Every write ends with its commit: a single statement, or one transaction as the last step.
So an operation that resolved has committed, and one that rejected left the database
unchanged (a restore or clear may already have written its safety-backup file).

## Decision

Owner, 2026-10-04 (Track 8 PR2 plan; option A of #106, plus §5):

1. **Once the operation has resolved, a failed reload never fails the write.** The store
   sets `stale` (the banner with Reload) and logs the reload error. The rule is the same for
   every write: forms, deletes, the assumptions, scenarios, property flags, the sample banner
   (`mutate`), and restore, Clear sample, Load sample, CSV import and the export record
   (`exclusive`).
2. Restore and Clear sample resolve with the safety backup's name, so their usual success
   message names it. CSV import shows its report. Forms and confirmations close.
3. The write result stays `{ ok: true }`; the store's `stale` flag carries the reload
   failure. The error banner is cleared on success as before; the stale banner explains.
4. The "rolled back" and "unchanged" messages now appear only for failures before the
   commit, where they are true. No message text changes.
5. **The Assumptions page keeps its values after a save while the screen is stale.** It
   shows the saved values (so a later edit cannot write the old ones back) and "Unsaved
   changes" until a Reload confirms them. Saving again is a harmless upsert.
6. Failures before the commit behave as before: the store reloads and reports the failure.

## Consequences

- Parity, the golden master and the bench budgets are unchanged: no engine logic changes.
- User-visible: a write that went through is reported as done, never as rolled back.
- Until Reload the screen can disagree with itself: the "sample cleared" notice beside the
  sample banner, a new scenario ticked for compare but not yet listed, an imported
  property's link landing on the empty property page. Nothing crashes, and the banner asks
  for a Reload.
- Other forms save what they show. Editing a record again before Reload can write the old
  values it shows; the banner says to reload first.
- When the reload keeps failing, its cause is only in `app.log`, as it already was for the
  banner's Reload.
- Logs: a reload failure after the export record is logged as `WRITE`, not `BACKUP`; a second
  reload failure after a failed write is logged instead of dropped; the `edit-saved`
  timing is also recorded when the reload failed.
