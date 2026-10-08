# 0096. CSV import preview: adds and updates before importing

- Status: Accepted
- Date: 2026-10-03
- Source: issue #34 (pre-release review 2026-10, finding A10 and §6 "import dry run with
  separate additions and updates")
- Amended by: [0154](0154-one-outcome-path.md) (the import report is also cleared when the
  data is replaced)

## Context

CSV import upserts by natural key (D-55): a property by name, a valuation by
`(property_name, valid_from)`, a lease and a mortgage block by `(property_name, start_date)`.
Validation runs first and the batch is written in one transaction (D-14, DR-023), but the
user cannot see which rows will be added and which will overwrite stored records. After a
successful import the page says only "N added or updated" per file, and that report is lost
when the user navigates away.

## Decision

1. **One shared plan.** A pure `planImport(batch, tables)` in `src/import/csvImport.ts`
   matches every row, builds the write statements, runs the input-rule check and classifies
   each row. The preview and the commit both use it, so they cannot disagree.
2. **What counts as an update.** A row that matches a stored record is an **update** only
   when at least one column the CSV writes has a different value. A match with no
   difference is **unchanged**. A row with no match is an **add**. Renaming a property in
   the CSV is therefore an add (documented behaviour since #29). Values are compared after
   normalisation: decimals by value (`4080000` = `4080000.00`), an empty cell equals a
   stored empty value, and an empty `contract_maturity_date` (which keeps the stored date,
   DR-129) is never a change.
3. **Preview.** When every chosen file is valid, the Import panel shows a preview above the
   button: one line per file with the counts to add, update and leave unchanged, and an
   expandable list naming each record (`Byt Javorova`, `Byt Javorova · 01.06.2026`). Each
   update lists its changed columns as `before → after`, formatted for display. If the plan
   already has problems (an unknown property or a broken input rule), they are shown with
   the existing "Nothing was imported" table before the user presses Import, and Import is
   disabled.
4. **Import button and confirmation.** The button states the scope:
   "Import 4 records (3 new, 1 update)". Unchanged rows are not counted. When the plan has
   updates, pressing it opens the inline confirm row used elsewhere in the app with
   **Overwrite N existing records** and **Cancel**; nothing is written until the user
   confirms. A plan with only adds imports on the first press. When every row is
   unchanged, the button stays disabled and the page says every record is already up to
   date.
5. **Plan-change guard.** The commit re-reads the database and re-plans. If the new plan
   differs from the one the user previewed (another edit happened in between), nothing is
   written; the page says the data changed, shows the new preview and asks the user to
   review it and import again.
6. **The report stays.** After a successful import the report lists, per file, the records
   added and updated (unchanged ones as a count), each with a link that opens its property.
   It is kept in the UI store until the next import or app restart, so it survives
   navigating away and back.
7. Strings are added in en, cs and ru. Atomicity, matching rules and limits are unchanged.

## Consequences

User-visible: a new preview, a scoped button label, a confirmation step for overwrites, a
new "data changed" message, and a persistent report with links. No computed number, parity
target or engine output changes. `src/import/csv.ts` stays pure; the page reads the plan
through the state facade (ADR 0072). The import still writes unchanged rows exactly as
before (an update with the same values), so the stored result of an import is unchanged by
this decision. The ux-capture screens `50`–`52` change.
