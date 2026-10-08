# 0154. One outcome path: notices that follow the owner, one toast

- Status: Proposed
- Date: 2026-10-08
- Source: issue #136 (2026-10 code review, findings R5-11, G2-4-05, G2-4-06); owner
  decision D14 (2026-10-08: option A without a navigation guard; the startup screen's
  restore carries its notice into the app; one toast duration of 4000 ms); Track 11 PR 11.5
- Amends: [0094](0094-sample-portfolio-clear.md) (the "sample cleared" notice shows on
  every page and is cleared when the data is replaced),
  [0096](0096-csv-import-preview.md) (the import report is also cleared when the data is
  replaced), [0153](0153-honest-startup-failures.md) (Continue keeps the safety copy's
  name in the app)
- Related: [0110](0110-backup-recency-indicator.md) (backup recency), [0112](0112-load-sample-on-demand.md)
  (Load sample), [0125](0125-committed-write-reload-failure.md) (a failed reload after a commit),
  [0142](0142-row-switch-guard-busy-dialog.md) (the leave guard, not used here),
  [0147](0147-failure-messages-and-log.md) (failure sites and texts)

## Context

The app reported the outcome of an action in three ways, and they had drifted:

1. A restore named its safety backup (the owner's undo copy) only in a toast that went
   away after 2.4 s. Clear sample kept the same kind of name on screen until dismissed
   (ADR 0094).
2. `ExportXlsxButton` had its own copy of the toast timer. Durations had drifted to
   2200, 2400 and 2500 ms. An export failure also vanished after 2.5 s.
3. Each page mounted its toast's live region together with the text. Screen readers
   announce a region more reliably when it exists before its text changes. This was not
   tested with VoiceOver, so it is a risk, not a proven failure.
4. Restore, Load sample and import failures were kept in page state. When the owner left
   the page while one ran, the outcome was never shown.
5. "Sample cleared" stayed after the sample was loaded again, next to the sample banner.
   The last import report kept links to properties that a restore or Clear sample had
   removed.

## Decision

1. **Notice.** `uiStore.notice` holds the outcome of a whole-database action until
   Dismiss:
   - a restore's safety backup (`restored`);
   - Clear sample's safety backup (`sampleCleared`, replacing `sampleClearedBackup`);
   - a failure (`failed`) of a restore, a backup pick, a backup export, Load sample, an
     import write or an `.xlsx` export.

   There is one slot, and the latest outcome wins. The notice holds data, not text. It is
   translated when it renders, so a language switch re-translates it. The app shell shows
   it at the top of every page, under the stale-data and edit-error banners. Because the
   handlers write to the store, not to page state, the outcome reaches the owner on
   whatever page they are on. A refused backup's records (`IssueTable`) stay with its
   notice. Failures are logged once, where they are caught (`logBackupFailure`).

2. **Toast.** `uiStore.toast` with one duration, `TOAST_MS = 4000`. A newer toast replaces
   the text and restarts the timer (DR-058). The app shell keeps an empty
   `role="status" aria-live="polite"` region mounted, and the toast appears inside it.
   `useToast()` takes no duration. Toasts are kept for short confirmations that need no
   follow-up: saved, exported, sample loaded.
3. **Replaced data.** On success, restore, Clear sample and Load sample call
   `dataReplaced()`, which clears the notice and `lastImport`. In `portfolioStore` the same
   three actions clear the edit-error banner (`error`), as a successful edit does. The
   caller then sets its own outcome. Clear sample followed by Load sample therefore shows
   only the sample banner.
4. **One action at a time on Settings → Backup.** While a restore or Load sample runs, the
   panel's export, choose-file, Clear sample and Load sample buttons are disabled.
   Elsewhere the store's write queue already serialises whole-database work.
5. **Startup screen.** Continue (or Try again) after a restore from the startup error screen
   sets the `restored` notice, so the safety copy stays named inside the app.

No navigation guard (option C, or a busy source next to ADR 0142): the notice already
survives a page change, and the app never locks.

Dictionary keys used, with no new keys: `backup.restored`, `sample.cleared`,
`backup.restoreFailed`, `backup.errInvalid`, `backup.exportFailed`, `sample.loadFailed`,
`importPage.importFailed`, `xlsx.exportFailed`, `xlsx.exported`, `sample.loaded`,
`common.dismiss`.

## Consequences

- The undo copy's name stays visible until the owner dismisses it, as it does after Clear
  sample.
- A whole-database failure appears at the top of the page, where edit failures already
  appear, instead of in a panel at the bottom of Settings → Backup. Its text does not
  change.
- One toast implementation and one duration. The `Toast` primitive and six page-local
  render sites are removed.
- Residual: a CSV import refused by its checks (`CsvImportError`) or a changed plan
  (`CsvPlanChangedError`) stays on the Import page. Nothing was written, and the details
  belong to the files chosen there, which leaving the page drops anyway.
- Tests: `uiStoreOutcomes.test.ts` (duration, restart, notice, `dataReplaced`),
  `OutcomeRegions.test.tsx` (empty live region, translation at render, issue table, export
  failure persists), `ActionOutcomes.test.tsx` (leaving Settings mid-restore: success and
  failure shown on the Dashboard), plus `BackupRestore`, `SampleBanner`, `ImportDone`,
  `BootRestore`, `backupStore` and `sampleStore` cases.
