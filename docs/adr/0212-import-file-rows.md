# 0212. Import: one list of file types

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #389 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's layout); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Related: [0199](0199-icon-only-row-actions.md) (the template button is a row action),
  [0096](0096-csv-import-preview.md) (the preview and report, unchanged),
  [0185](0185-csv-missing-columns-and-preview-clarity.md) (a file with no data rows is not a success)
- Amended by: [0225](0225-sweep-round-2.md) (the error table's region is named by its file type)

## Context

The Import page stacked four near-identical panels (Properties, Valuations, Rents /
Leases, Mortgages), each about 190 px tall around a dashed drop area with "Choose file…",
"Download template" and a hint. With a file chosen, the Import panel with its preview
started below the fold at 1280 × 800.

## Decision

1. **One panel, "Import files"** (`importPage.filesTitle`), with one row per file type in
   the order above. A row shows the type, the file name (the expected `*.csv` until a file
   is chosen, in the soft ink colour; then the chosen file's name), "Choose file…" (after a choice "Re-upload…",
   `importPage.reuploadShort`), a template button and the file's status badge (rows
   ready, no data rows, errors; unchanged wording). The panel's note says
   `importPage.dropOnRow` ("Drop a CSV file on its row.").
2. **Each row is its own drop target.** A file dropped on a row is that row's type; a file
   is never routed by its name. A row shows the drag-over state while a file is over it,
   and a focus ring while one of its buttons has keyboard focus.
3. **Names say the type.** The file button's accessible name is
   `importPage.chooseFileFor(type)` ("Choose file for Valuations") or
   `importPage.reuploadFor(type, name)` ("Re-upload file for Valuations, v.csv"); each
   starts with the button's visible text. The template button is an icon-only row
   action (ADR 0199: name and tooltip on hover and keyboard focus),
   `importPage.templateFor(type)` ("Download Valuations template").
4. **A file's errors** are listed under its row, in the same error table as before, and
   a failed template download's message sits under its row.
5. **Unchanged:** CSV parsing and validation, the Import panel with its preview, the
   import and its report.

## Consequences

- The four rows take about 200 px instead of about 760 px; with a file chosen the
  Import panel with its preview starts in the first viewport at 1280 × 800 (checked by
  the ux capture, screens 50 and 53).
- No computed number, stored data or export changes.
- New dictionary entries in en, cs and ru: `filesTitle`, `dropOnRow`, `reuploadShort`,
  `chooseFileFor`, `reuploadFor`, `templateFor`; `dropHint`, `reupload` and
  `downloadTemplate` are removed.
