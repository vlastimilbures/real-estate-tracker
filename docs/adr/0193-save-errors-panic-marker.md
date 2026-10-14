# 0193. Save errors without English; a cut panic message is marked

- Status: Accepted
- Date: 2026-10-14
- Source: issues #169 (finding G2-5-07, quick fix), #323 (item 2); owner decisions
  2026-10-14 (#169 quick fix, #323 marker only); Track 14 PR N13b
- Amends: [0175](0175-verified-file-writes-error-codes-backup-folder.md) (decision on the
  capped panic line: a cut message ends with "…")

## Context

1. A failed Excel export or CSV template save wraps the OS text in an English sentence, so
   the Czech message reads "Export selhal (Could not save the file: No space left on
   device (os error 28))" (#169, G2-5-07). The backup screen already shows the OS text
   alone.
2. The crash log cuts a panic message at 500 characters without a mark, so a cut message
   looks complete (#323 item 2).

## Decision

1. **A file-save failure shows the OS text without the English wrapper** in the export
   failure banner and the CSV template error, as the backup screen does: "Export selhal (No
   space left on device (os error 28))". The OS text itself stays as the OS gives it;
   translating its causes is left out (#169 option C not taken).
2. **A panic message cut at 500 characters ends with "…"** in the crash log.

## Consequences

- No computed number, export or stored data changes.
- The save-failure message no longer says "Could not save the file" in English; the action
  ("Export failed", "Template could not be saved") already says so in the UI language.
- Left out (owner, 2026-10-14): the hard-link no-overwrite write of #323 item 1 (one writer,
  unreachable; ADR 0175 already states it).
