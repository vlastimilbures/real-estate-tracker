# 0254. An unknown property is reported once, by the import plan

- Status: Accepted
- Date: 2026-11-18
- Source: issue #482 (code review 2026-11, tracking #435); owner decision 2026-11-18
  (#435 comment 6965976270: "drop double unknown-property check"); the plan posted on #482
  (comment 6971595257, PR 2)
- Amends: [0146](0146-app-shell-survives-page-errors.md) §2 (the Import page no longer
  checks child files for known property names, so it reads no names from the stored
  portfolio)
- Related: [0096](0096-csv-import-preview.md) §3 (an unknown property is a plan problem,
  unchanged), [0229](0229-import-writes-plan-at-click.md) §2 (the plan built at the click
  refuses it, unchanged), [0049](0049-czech-excel-csv.md) (D-55, name matching, unchanged),
  [0237](0237-property-names-nfc.md) (names compared in NFC, unchanged)

## Context

A child file (valuations, rents, mortgages) can name a property that is neither stored
nor in the chosen `properties.csv`. Two places check for that today:

1. **The parser.** The Import page passes the stored names plus the names of the parsed
   `properties.csv` rows to `parseValuations` / `parseRents` / `parseMortgages`
   (`knownNames`). A child row with another name gets an `unknownProperty` cell error in
   its file's table and is dropped. When `properties.csv` changes, the page parses the
   chosen child files again with the new names.
2. **The import plan.** The preview and the import at the click match every child row
   to a stored or new property and refuse one with no match (`unknownProperty` in the
   "Import refused" table, ADR 0096 §3, ADR 0229 §2).

The plan's check is the only one that runs when Import is pressed, so it cannot go. The
parser's check repeats it, and it also reports knock-on errors. Take a stored
_Byt Javorova_, a `properties.csv` whose row for a new _Byt Lipova_ has no price, and a
`valuations.csv` with rows for _Byt Javorova_, _Byt Neexistujici_ and _Byt Lipova_. Today
the valuations file shows _Unknown property_ for _Byt Neexistujici_, and also for
_Byt Lipova_, only because its `properties.csv` row was dropped for the missing price.

## Decision

1. **The parser no longer checks property names.** `parseValuations`, `parseRents` and
   `parseMortgages` take only the file; the `knownNames` argument, the `knownProperty`
   column kind and the parser's `unknownProperty` error code are removed. The
   `property_name` column is read as text, still required.
2. **The Import page parses each file once.** It no longer builds the known names or
   parses the chosen child files again when `properties.csv` changes.
3. **The plan's check stays as it is.** It runs at the preview and at the click, with the
   same `importPage.errUnknownProperty` text (D-55 matching, NFC per ADR 0237).
4. Tests, written failing first (`ImportUnknownPropertyOnce.test.tsx`): a child file
   naming an unknown property shows no cell error in its file's table, its row is kept
   (the file reads as ready), and the name is listed once, in the "Import refused" table.
   The four parser tests of the removed check are deleted, and the other tests drop the
   removed argument.

## Consequences

- **What the owner sees.** In the example above, the valuations file shows only its own
  cell errors. _Byt Neexistujici_ appears once, in the "Import refused" table, after the
  other errors are fixed. A misspelt name in a child file now shows one round later than
  today: first the files' own errors, then the plan's refusal.
- **Duplicates.** A child row naming an unknown property is no longer dropped by the
  parser, so its key counts for the in-file duplicate check (ADR 0185 §3): a repeated
  unknown key is reported as a duplicate, and the plan then reports the rows that remain.
- **Nothing more is imported.** Every child row with an unknown name is still refused by
  the plan, at the preview and at the click; nothing is written.
- **No copy change.** The dictionary entry `importPage.errUnknownProperty` stays: the
  "Import refused" table uses it. No entry is added or removed.
- **Screens.** ux-capture `51-import-errors` changes as intended: the valuations file's
  table loses its _Unknown property_ row for _Byt Neexistujici_, and its error count
  falls by one. No other screen is expected to change.
- No computed number, parity target, golden master, stored data or export changes;
  `src/engine` is untouched.
