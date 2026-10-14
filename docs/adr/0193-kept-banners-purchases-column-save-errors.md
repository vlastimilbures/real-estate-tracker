# 0193. Kept app banners announce once; a purchases column; save errors without English

- Status: Accepted
- Date: 2026-10-14
- Source: issues #350 (follow-up of the review of PR #349), #317 (split from #299 item 4),
  #169 (finding G2-5-07, quick fix), #323 (item 2); owner decisions 2026-10-14 (#350
  announce once, #317 add the column, #169 quick fix, #323 marker only); Track 14 PR N13b
- Amends: [0189](0189-outcome-regions-pending-purchase-a11y.md) (§1: the stale-data and
  edit-error banners too), [0165](0165-future-purchases.md) (the projection table shows the
  acquired value), [0175](0175-verified-file-writes-error-codes-backup-folder.md) (decision
  on the capped panic line: a cut message ends with "…")

## Context

1. ADR 0189 makes the kept notice and failure banners announce once. The app shell's other
   two kept banners, "the data could not be reloaded" (stale) and the edit error, still
   mount with `role="alert"` on every page, so a screen reader reads them again on each page
   change (#350).
2. In the year a future purchase turns on, the projection table's Value jumps by the
   property's value and no column says why (#317). The engine already returns that amount
   per year as `acquiredValue` (ADR 0165).
3. A failed Excel export or CSV template save wraps the OS text in an English sentence, so
   the Czech message reads "Export selhal (Could not save the file: No space left on
   device (os error 28))" (#169, G2-5-07). The backup screen already shows the OS text
   alone.
4. The crash log cuts a panic message at 500 characters without a mark, so a cut message
   looks complete (#323 item 2).

## Decision

1. **The stale-data and edit-error banners announce once**, as ADR 0189 §1 does for the
   notice and failure: the page where one first shows gives it `role="alert"`; later pages
   show it without a live role until it is cleared. A new edit error, or the data going
   stale again after a reload, is announced again.
2. **The projection table and its Excel export get a Purchases column** (`projGrid.purchases`:
   "Purchases", "Nákupy", "Покупки") right after Value: the value a future purchase comes
   online with, in its turn-on year. Like the other optional columns (ADR 0116 §12) it shows
   only when some year is non-zero in whole Kč; year 0 is blank, as for the other flows. The
   real lens deflates it like the other money columns.
3. **A file-save failure shows the OS text without the English wrapper** in the export
   failure banner and the CSV template error, as the backup screen does: "Export selhal (No
   space left on device (os error 28))". The OS text itself stays as the OS gives it;
   translating its causes is left out (#169 option C not taken).
4. **A panic message cut at 500 characters ends with "…"** in the crash log.

## Consequences

- No computed number changes. The projection export gains a column only for a portfolio or
  property with a future purchase in the horizon; other exports are unchanged.
- The sample portfolio has no future purchase, so its screens and exports are unchanged;
  the column shows once the owner adds a property bought after the projection start.
- The save-failure message no longer says "Could not save the file" in English; the action
  ("Export failed", "Template could not be saved") already says so in the UI language.
- Left out (owner, 2026-10-14): the hard-link no-overwrite write of #323 item 1 (one writer,
  unreachable; ADR 0175 already states it).
