# CSV import guide

How to load several properties and their records at once from CSV files on the **Import**
page. This describes how the importer behaves today; the contributor-oriented rules are in
[SPEC §6](../SPEC.md#6-csv-importer).

## Overview

There are four files, one per kind of record. Each has its own picker on the Import page, and
each picker has a **Download template** button that saves the header and one example row.

| File             | Holds                                     | One row is           |
| ---------------- | ----------------------------------------- | -------------------- |
| `properties.csv` | The properties themselves                 | one property         |
| `valuations.csv` | Market values, effective-dated            | one valuation period |
| `rents.csv`      | Leases (monthly rent), effective-dated    | one lease period     |
| `mortgages.csv`  | Mortgage blocks (one per fixation period) | one mortgage block   |

You can choose any subset of the four files. Everything you choose is imported together, as
one batch, when you press the **Import** button.

- **Order does not matter.** You can choose the files in any order; properties in the batch
  are written before the rows that refer to them.
- **Every `property_name` must be known.** It must match a property already in the app or a
  row in the `properties.csv` of the same batch. Otherwise the row shows _Unknown property_.
- The file names above are only labels: the picker decides what a file holds, not its name.

## The files

Types used below:

- **Text**: any text; leading and trailing spaces are removed.
- **Date**: `YYYY-MM-DD`, and a real calendar date (`2026-02-31` is refused). The app shows
  dates as `dd.mm.yyyy`, but CSV files use the ISO form.
- **Money**: Kč as a plain decimal with a decimal point: `4080000` or `6721.8`. No thousands
  separators, no currency sign, no exponent, never negative.
- **Fraction**: a rate written as a fraction, not a percentage: `0.039` means 3.9 %.
- **Whole number**: digits only, within the stated range.
- **Yes/no**: `true` or `false` (`1`/`0` and `yes`/`no` are accepted too, in any case).

An optional column may be left empty.

### properties.csv

| Column                     | Required | Type         | Notes                                                                                    |
| -------------------------- | -------- | ------------ | ---------------------------------------------------------------------------------------- |
| `name`                     | yes      | Text         | Identifies the property (see [Matching](#matching-and-updates))                          |
| `address`                  | no       | Text         |                                                                                          |
| `type`                     | no       | Text         | Free text, e.g. `3 bedroom`                                                              |
| `size_m2`                  | no       | Whole number | 1–10 000 m²                                                                              |
| `garage`                   | no       | Yes/no       |                                                                                          |
| `purchase_date`            | yes      | Date         |                                                                                          |
| `purchase_price`           | yes      | Money        |                                                                                          |
| `appreciation_override_pa` | no       | Fraction     | Yearly value growth for this property; may be negative. Empty ⇒ the Assumptions value    |
| `rent_index_override_pa`   | no       | Fraction     | Yearly rent indexation for this property; may be negative. Empty ⇒ the Assumptions value |

```csv
name,address,type,size_m2,garage,purchase_date,purchase_price,appreciation_override_pa,rent_index_override_pa
Byt Javorova,Javorova 12 Praha,3 bedroom,71,true,2015-06-01,4080000,,
Byt Lipova,Lipova 5 Brno,2 bedroom,54,false,2019-03-15,3150000,0.03,
```

### valuations.csv

| Column          | Required | Type  | Notes                                     |
| --------------- | -------- | ----- | ----------------------------------------- |
| `property_name` | yes      | Text  | An existing property or one in this batch |
| `valid_from`    | yes      | Date  | The day this value starts to apply        |
| `valid_to`      | no       | Date  | Empty ⇒ open-ended                        |
| `market_value`  | yes      | Money |                                           |

```csv
property_name,valid_from,valid_to,market_value
Byt Javorova,2023-01-01,2025-12-31,9500000
Byt Javorova,2026-01-01,,10200000
Byt Lipova,2026-01-01,,7800000
```

### rents.csv

| Column          | Required | Type  | Notes                                     |
| --------------- | -------- | ----- | ----------------------------------------- |
| `property_name` | yes      | Text  | An existing property or one in this batch |
| `start_date`    | yes      | Date  | First day of the lease                    |
| `end_date`      | no       | Date  | Empty ⇒ open-ended; not before the start  |
| `monthly_rent`  | yes      | Money | Rent per month                            |

```csv
property_name,start_date,end_date,monthly_rent
Byt Javorova,2024-09-01,2025-08-31,26000
Byt Javorova,2025-09-01,,27200
Byt Lipova,2025-03-01,,21500
```

### mortgages.csv

One row is one mortgage block: a loan, or the period after a re-fixation, with its own start
date, rate and instalment.

| Column                   | Required    | Type         | Notes                                                                        |
| ------------------------ | ----------- | ------------ | ---------------------------------------------------------------------------- |
| `property_name`          | yes         | Text         | An existing property or one in this batch                                    |
| `start_date`             | yes         | Date         | First day of the block                                                       |
| `initial_principal`      | yes         | Money        | The balance at the block start                                               |
| `fixation_years`         | yes         | Whole number | 0–50                                                                         |
| `interest_rate_pa`       | yes         | Fraction     | 0–1, e.g. `0.0169` = 1.69 %                                                  |
| `monthly_instalment`     | conditional | Money        | Required unless `loan_term_years` is given                                   |
| `loan_term_years`        | no          | Whole number | 1–50. Empty ⇒ the term follows from the instalment                           |
| `contract_maturity_date` | no          | Date         | Used only as a consistency check. Empty on a re-import keeps the stored date |

If `monthly_instalment` is empty and `loan_term_years` is given, the app calculates the
instalment from the principal, rate and term, rounded **up** to a whole koruna so the loan
fully repays. An instalment you enter is used as written. The instalment must be more than
the first month's interest.

```csv
property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years,contract_maturity_date
Byt Javorova,2021-01-17,1912500,10,0.0169,6721.8,,
Byt Lipova,2019-03-15,2400000,5,0.0459,,30,
```

## Matching and updates

Importing the same records again updates them instead of creating duplicates. Each row is
matched to an existing record by its natural key:

| File             | Key                            |
| ---------------- | ------------------------------ |
| `properties.csv` | `name`                         |
| `valuations.csv` | `property_name` + `valid_from` |
| `rents.csv`      | `property_name` + `start_date` |
| `mortgages.csv`  | `property_name` + `start_date` |

- **Names match ignoring case and surrounding spaces.** `byt javorova ` matches
  `Byt Javorova`. The stored spelling is kept; an import never changes a property's name.
- **Renaming a property in the CSV creates a new property.** There is no rename by import:
  `Byt Javorova 2` is a different key, so it is added as a new property next to the old one.
  Rename a property in the app instead.
- **Changing a key date creates a new record.** A lease row with a new `start_date` is added
  as another lease; the old one stays. Edit or delete the old record in the app.
- **A match updates only the CSV columns.** What the CSV does not hold is left as stored: a
  property's active/inactive state and holding costs, and a mortgage block's draws and
  interest-only date. An empty `contract_maturity_date` keeps the stored date.
- **An update writes every CSV column.** An empty optional cell clears the stored value (for
  example an empty `address`), except `contract_maturity_date` as above.
- **Each key may appear once per file.** A second row with the same key — including names
  that differ only by case or spaces — is an error that points at the first row.
- **Nothing is deleted.** A record missing from the CSV stays in the app.
- A new property gets an empty holding-costs record, so its costs follow the Assumptions
  defaults until you set them.

## Preview and confirmation

Once every chosen file is valid, the Import panel shows a **preview** before anything is
written. For each file it lists how many records it will add, update and leave unchanged:

- **Will add** — rows with no matching record (including a renamed property).
- **Will update** — rows that match a record and change at least one column. Each one lists
  its changed columns as `before → after`.
- **Unchanged** — rows that match a record and change nothing. They are counted, not listed.

Expand a list to see each record by name (`Byt Javorova`, or `Byt Javorova · 01.06.2026` for
a dated record). The button states the scope, for example **Import 4 records (3 new, 1
update)**. If the import updates existing records, pressing it asks you to confirm with
**Overwrite 1 existing record**; an import that only adds records starts at once. When every
row is unchanged there is nothing to import, and the button stays disabled.

If your data changes between the preview and the import (for example you edited a property
in the meantime), nothing is written: the page says so and shows the new preview to review.

After the import, the **Import report** lists the records added and updated, each linking to
its property. It stays on the Import page until your next import or until you quit the app.

## All or nothing

The whole batch — every file you chose — is imported in one step:

1. Each file is checked as you choose it. Errors are listed with the file line and column,
   and the Import button stays disabled until every file is clean.
2. The preview merges the rows with your current data and checks the result against the
   same rules as the forms (for example an instalment that does not cover the interest, or a
   lease that ends before it starts).
3. If any row breaks a rule, nothing can be imported. The app shows _"Nothing was imported.
   Correct these rows and import again"_ with each file, line and column.
4. Otherwise, when you press Import, the plan is checked once more and every row is written
   in one database transaction. If the write itself fails, it is rolled back and nothing is
   imported.

There is no partial import: one bad row in one file stops the whole batch.

**Limits:** each file may be at most 2 MB and 5,000 data rows.

## File format

- **UTF-8** text, **comma**-separated, with a header row. A leading byte-order mark is fine.
- **Header names** are matched exactly (lower case, as in the tables above); spaces around a
  name are ignored. Columns may be in any order, and extra columns are ignored. A missing
  required column makes that cell _Required_ on every row.
- **Every row has as many cells as the header.** Empty lines are skipped. Put a cell in
  double quotes if it contains a comma: `"Javorova 12, Praha"`.
- **Dates** `YYYY-MM-DD`; **numbers** with a decimal point and no spaces.

### Saving from a spreadsheet

Spreadsheets set to Czech regional settings often write semicolons, decimal commas
(`1 234,5`) and Windows-1250 text. The app refuses such files and names the fix:

| Problem                   | Message tells you to                             |
| ------------------------- | ------------------------------------------------ |
| Not UTF-8 (Windows-1250)  | save as **CSV UTF-8**                            |
| Semicolon-separated       | save as **CSV UTF-8 (comma delimited)**          |
| Decimal comma in a number | write numbers with a decimal point and no spaces |

In Excel choose **File → Save As → CSV UTF-8 (Comma delimited)**. If the result still uses
semicolons or decimal commas, your system's list and decimal separators decide it: change
them, or save from Numbers (**File → Export To → CSV**, text encoding **Unicode (UTF-8)**)
and check the file in a text editor. The app does not convert these files itself.

## What CSV does not import

- **Assumptions** (Settings → Assumptions).
- **Holding costs** — set them on the property's page.
- **Mortgage draws, completion date and interest-only period** of a development loan — set
  them in the mortgage form.
- **Active/inactive state** of a property.

## Export is not import

- **Export to Excel** (Projections) writes a report of the projection. It is not in the
  import format and cannot be imported back.
- **Backups** are the round-trip format. **Settings → Backup & Restore → Export backup…**
  saves all your data in one JSON file, and **Restore** loads it back, replacing everything.
  See [Data safety & recovery](data-safety.md).
