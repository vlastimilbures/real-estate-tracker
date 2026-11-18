# 0225. Round-2 sweep: the Guide's nav in narrow windows, import error tables named

- Status: Accepted
- Date: 2026-11-16
- Source: issue #424 (UX/UI review 2026-11, round 2, tracking #425); the round-1
  follow-ups listed on #392 (the Guide's top bar in Russian at 900 px; the import error
  table's name); acceptance delegated by the owner for the 2026-11-16 run
- Amends: [0213](0213-guide-section-nav.md) §2 (the Guide's links take one row in a
  narrow window), [0212](0212-import-file-rows.md) §4 (the error table's region name)
- Related: [0158](0158-layouts-hold-in-czech-and-russian.md) (section navs wrap; kept for
  Property detail), [0107](0107-property-section-nav.md)

## Context

A full capture after round 2 (en/cs/ru × light/dark × 1280 × 800 / 900 × 600) found two
leftovers, both noted as follow-ups in round 1:

- The Guide's ten section links wrap to three rows in Russian at 900 × 600 (four before
  round 2). With the title and subtitle, the sticky top bar takes about 180 px of a
  600 px window. Property detail's eight links take two rows there, which is fine.
- Each import file's error table is a region named only by its count ("4 errors"). With
  errors in two files, a screen reader lists two regions that read alike.

The other screens hold the round-2 look. The two notes still shown under panels (the
Financing disclaimer, the KPI list's basis) are caveats a reader needs in view, so they
stay.

## Decision

1. **Error tables named by file type.** The region of a file's error table is named
   `importPage.errorsTableName` ("Valuations: 4 errors"). The badge on the row is
   unchanged (`importPage.errorsBadge`).
2. **The Guide's nav in one row when narrow.** In a window under 1,100 px wide the
   Guide's section links sit in one row that scrolls sideways. A fade marks the side with
   more links. The current section's link is kept in view, clear of the fade, as it
   changes and as the row resizes (another window width or language); a link reached by
   Tab is scrolled clear of the fade too. Wider windows still wrap
   (two rows at 1280 px in every language). Property detail keeps wrapping everywhere
   (ADR 0158).

## Consequences

- At 900 × 600 the Guide's top bar is the title, the subtitle and one row of links.
- Some Guide links are off to the side in a narrow window. They are reachable by
  scrolling the row and by Tab, which scrolls each link into view, and the current one
  is always shown.
- No computed number, stored data or export changes.
