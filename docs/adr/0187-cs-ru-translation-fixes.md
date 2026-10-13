# 0187. Czech and Russian translation fixes

- Status: Accepted
- Date: 2026-10-13
- Source: issues #169 and #152 (items 2–6), 2026-10 review; owner approved the exact
  wording on 2026-10-13; Track 14 PR N7b
- Related: [0152](0152-wording-log-and-generated-index.md) (accessible names, live regions,
  exports and code need an ADR), [0093](0093-scenario-add-flow.md) (presets matched by name),
  [0003](0003-czech-practice-decides.md) (banking terms)

## Context

The Czech and Russian dictionaries name one concept in several ways (principal, draws,
fixation end, the payment schedule, the pre-restore safety copy), leave English words
("Development", "Start", "refix"), break grammar ("годовых" after no number) and print
fixed plurals. A duplicated scenario is saved as "Name (copy)" in every language, and the
save dialogs name their file types in English. Many of these strings are accessible names
(labels, table headers, toggle options, the Projections picker's aria-label), form alerts,
or text written to the xlsx exports, so the change is recorded here; the plain-text rest is
in the wording log (2026-10-13 · N7b).

## Decision

1. Russian uses "основной долг" for principal, "выборка/выбрано" for drawing with "транш"
   for each portion, "страховочная копия" for the pre-restore copy, "Номинальные" beside
   "Реальные", "конец фиксации" and "ставка после фиксации", and "График платежей" for the
   schedule.
2. Czech uses "konec fixace" and "sazba po skončení fixace", "začátek" for a loan's start,
   "Výstavba", "Začátek", "Náklady na držbu", "Daň z nemovitých věcí" and
   "Splátkový kalendář".
3. English drops "refix" ("Rate shock at fixation end"); "rate reset" stays.
4. Count words use the plural helpers (CSV row length, Russian filter subtitle, compare-full
   toasts).
5. A duplicate's name takes the suffix `scenarios.copyName` in the UI language; names saved
   before keep "(copy)". The save dialogs take `xlsx.fileType` / `backup.fileType`.
6. No preset name changes (ADR 0093): the crash labels "−20%" stay as they are.
7. A test fails when a cs/ru string equals English (allow-list) or uses a retired term.

## Consequences

Copy only: no computed number, parity target or golden master changes. Exports carry the new
headers and lens notes. Raw OS error text in export failures (#169 G2-5-07) stays open.
