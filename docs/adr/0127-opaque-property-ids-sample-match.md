# 0127. Random property ids; the sample is matched by id and name

- Status: Accepted
- Date: 2026-10-04
- Source: issues #101 and #105 (2026-10 code review: R6-01, R3-03, R3-02, R4-01, R6-02;
  G2-4-03)
- Amends: [0094](0094-sample-portfolio-clear.md) §3 and §5 (which properties are the sample)
  and its Consequences (a restore clears the sample markers)
- Related: [0014](0014-rust-transaction-command.md) (one transaction per write),
  [0049](0049-czech-excel-csv.md) (D-55: CSV name matching), [0096](0096-csv-import-preview.md)
  (preview fingerprint), [0110](0110-backup-recency-indicator.md) (`app_meta`),
  [0112](0112-load-sample-on-demand.md) (load sample on demand)

## Context

A new property's id, its primary key, was `slug(name)`, both in the property form and in CSV
import. `slug()` keeps only `a-z` and `0-9`, which caused two bugs.

- **#105.** A name with no Latin letters or digits, such as any Cyrillic name, got the id `""`.
  The UI treats `""` as "no property", so the property showed in the list but its page never
  opened, and no valuation, lease or mortgage could be added to it. A second such name failed on
  the primary key with "a record with the same internal id already exists". Similar names
  collided the same way ("Byt 1" / "Byt-1", "Lipová 2" / "Lipova 2"). A CSV file that held a
  Cyrillic property together with its rents, valuations or mortgages was refused, because its own
  rows could not find the property.
- **#101.** The app recognised the sample portfolio by its fixed ids `javorova`, `lipova` and
  `dubova`, plus the `app_meta.sample_active` marker (ADR 0094). An own flat named "Dubová" got
  the id `dubova`. The sample banner then came back over the owner's data, and **Clear sample
  deleted that flat** with every loan, lease and valuation. A restore never touched `app_meta`:
  after "first launch seeds the sample, then restore my backup", the marker sat on the owner's
  data and Clear sample deleted their `lipova` flat.

A safety backup was written before each clear, so the data could be recovered, but only by an
owner who noticed.

## Decision

Owner, 2026-10-04 (Track 8 PR3 plan; option A of #101 and #105):

1. **Random ids.** A new property gets a random id (`crypto.randomUUID()`), whether it is added
   in the property form or by a CSV import. A name never shapes an id. Existing ids are kept.
   - The property form makes one id when it opens and keeps it for every save attempt, as the
     scenario form does, so a retry cannot add a second property.
   - CSV import makes one id per new property name for each set of chosen files. The preview
     and the import of the same files therefore plan the same rows, and the preview check of
     ADR 0096 still matches.
2. **Explicit id checks.** The code tests "no property" with an explicit `null` / `undefined`
   check, never by the id's truthiness. A property stored with the id `""` before this change
   opens, edits and imports like any other. No migration re-keys it.
3. **Properties are listed by name.** With random ids, sorting by id would put the list in
   random order. Every property list (Properties, Dashboard, the property filters, exports)
   sorts by name in Czech alphabetical order, with numbers in number order ("Byt 2" before
   "Byt 10"). The id breaks ties. The sample keeps its order. Czech order applies in every
   UI language, so "Ch" comes after "H" in English and Russian too.
4. **A restore clears the sample markers** (amends ADR 0094, Consequences). The restore
   transaction also deletes `sample_active` and `sample_banner_dismissed`. After any restore there
   is no sample banner and no Clear sample panel. `sample_seeded` stays, so the sample is never
   seeded again. A restore still never imports `app_meta` keys from a file (ADR 0110).
5. **The sample is matched by id and name** (amends ADR 0094 §3 and §5). A property counts as
   part of the sample only when its id is a sample id **and** its name is still the seeded name:
   `javorova` "Byt Javorova", `lipova` "Byt Lipova", `dubova` "Byt Dubova". The same rule decides
   whether the banner shows and what Clear sample deletes, so the two never disagree. A sample
   flat the user renamed counts as their own and is kept. This also protects databases that
   already hold an own property with a sample id.
6. **Undoing Clear sample stays as it is** (G2-4-03). Restoring the pre-clear safety backup
   brings the sample flats back as ordinary data, without the banner, as ADR 0094 and ADR 0112
   already state. The app does not guess from names that restored rows are the sample.

## Consequences

- Parity, the golden master and the bench budgets are unchanged: no engine logic changes.
- User-visible: Cyrillic and other non-Latin names save, open and import. Similar names no
  longer collide. Clear sample never deletes a property the user added. After a restore, the
  banner never calls the owner's data a sample.
- Property lists change order where today's id order differed from the name order. For
  example, a flat imported as "Byt Ukazkovy" now comes after "Byt Lipova".
- Ids in the database, in backups, in the restore problem table and in `app.log` are no longer
  readable. CSV child ids built from a new property's id (`<id>-csv-v-<date>`) get longer.
  Events on the same day in the financing timeline break ties by id, which is now random
  (`src/engine/financing.ts`). That order has no effect on any computed number.
- The Clear sample dialog still says "the three sample apartments". The text was already
  inexact after the user deleted one by hand. It is now inexact after a rename too. The text
  is kept.
- Not changed: the `"portfolio"` and `"all"` filter values can still clash with an old id
  made from a name, and export file names are still made from the property name with
  `slug()`.
