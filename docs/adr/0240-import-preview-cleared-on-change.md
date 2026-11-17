# 0240. Import: the preview is cleared on every change

- Status: Accepted (owner-delegated, night run 2026-11-16; owner review pending)
- Date: 2026-11-17
- Source: issue #437 (code review 2026-11, finding R07-02, tracking #435); the plan posted
  on #437; non-critical decisions delegated by the owner for the 2026-11-16 night run
- Amends: [0096](0096-csv-import-preview.md) §3 (when the preview is shown)
- Related: [0185](0185-csv-missing-columns-and-preview-clarity.md) §6 (a commit-time problem
  is shown as a changed plan), [0212](0212-import-file-rows.md) (the Import panel with its
  preview); ADR 0229 (issue #447, the plan-changed comparison is dropped once this lands)

## Context

ADR 0096 previews an import once every chosen file is valid, and again whenever the files or
the stored data change. On such a change the page closed the confirm row, but dropped the old
preview only when no file was chosen or a file was invalid. When a valid file was replaced by
another valid file, or the stored data changed, the old preview stayed on screen with Import
enabled until the new preview arrived. A press in that window sent the new files with the old
plan's fingerprint; the commit refused it and the page said the plan had changed. Nothing was
written, but the "plan changed" message could come from the page's own timing, not only from
an outside edit.

## Decision

1. **A change clears the preview.** Any change to the chosen files or to the stored data
   drops the shown preview at once, whether or not the files are valid. Its summary, its
   problems table, the scoped button label and the confirm row go with it.
2. **Import waits for the new preview.** Until the new preview is shown, Import is disabled
   with its plain label (`importPage.importSelected`), so a press cannot commit a plan the
   page is not showing.
3. **Unchanged:** while a new file is still being read the old file and its preview stay on
   screen (the two still agree); no announcement is added or repeated; focus on the file rows
   and the Import button is unchanged; the fingerprint comparison and the "plan changed"
   message (ADR 0096 §5) stay until ADR 0229 removes them; ADR 0229 keeps the commit-time
   problem refusal (ADR 0185 §6).

## Consequences

- After a file is replaced, the Import panel shows no summary for the moment the new preview
  takes (one queued read, a few milliseconds), then the new one.
- The "plan changed" message is reached only by a change the page did not make.
- The summary is rebuilt, so a list the user opened or closed returns to its default, and
  focus inside the summary is lost.
- No computed number, stored data, export or dictionary entry changes. The ux-capture screens
  are taken after their final preview and do not change.
