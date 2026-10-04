# 0123. Scenario overrides meet the engine rules at every entry point

- Status: Accepted
- Date: 2026-10-04
- Source: issues #107 and #108 (2026-10 code review: R3-01, R7-02, G1-3-09, R4-02, R6-04)
- Completes: [0037](0037-data-integrity-codes.md), [0038](0038-range-codes.md) for scenarios
- Amends: [0052](0052-restore-safety-backup.md) (DR-019: restore checks every row)

## Context

Scenarios were the one kind of record that skipped the engine's input rules:

- The scenario form only checked that each percent parses. A vacancy of 150 % or a value
  crash of −20 % (a natural way to type "a 20 % drop"; the engine reads the crash as a
  positive haircut) was saved.
- The store saved scenarios with no rule check, unlike the assumptions and every portfolio
  row (UX-047).
- Restore mapped the scenario rows with a throw-away issue list and inserted the raw rows.
  A bad `created_at` passed restore, and from then on every startup failed with a screen
  that offers only "Try again". An out-of-range override also passed.
- The Scenarios compare ran the engine during render. A scenario that broke a rule threw,
  and the error boundary replaced the whole page, including the list where the scenario
  could be fixed. The compare selection lasts for the session (ADR 0101), so the page stayed
  broken until a restart.

`Scenario.createdAt` was read from the database and carried forward, but nothing showed it.
Its date guard was what turned a bad `created_at` into the startup failure.

## Decision

Owner, 2026-10-04 (Track 8 PR1 plan):

1. **One check, rules stay in the engine.** A scenario is checked by applying its overrides
   to the saved assumptions and running the engine's assumption rules
   (`scenarioRuleErrors` in `src/import/inputRules.ts`). Only problems in a field the
   scenario itself sets count. Every rule on a scenario field is independent of the base
   assumptions (vacancy 0–1, value crash 0–1, shock years whole and ≥ 0, finite levels), so
   saving the assumptions never needs to re-check the scenarios, and a problem in the base
   assumptions is never blamed on a scenario.
2. **The store refuses before writing.** Adding, saving and duplicating a scenario run the
   check first, as saving the assumptions does. A refused scenario writes nothing.
3. **The form shows the broken rule on its field**, with the engine's own text: the same
   text as the error banner and the Assumptions page. Vacancy and Value crash are the fields
   the form can get wrong; anything else is shown above the buttons. The Value crash help
   says that 20 means values drop 20 %. The form creates a new scenario's id once and
   ignores a second submit while saving, so a double Enter no longer saves two scenarios.
4. **Restore reads every scenario row before anything is written.** A missing or invalid
   `created_at` (its first ten characters must be a real date) is refused on column
   `created_at`. Unreadable overrides are refused once, on column `overrides`. An override
   that breaks an engine rule is refused on the scenario's row, column `overrides`, with the
   rule's text. As for every restore issue, no value is shown. Nothing is written and no
   safety backup is made when a file is refused.
5. **The compare never fails on a scenario's own overrides.** It leaves such a scenario out
   and names it above the key figures ("Not compared: … Edit or delete it in the list.").
   Problems in the portfolio data still show the invalid-data notice, as before (DR-146).
6. **The app no longer reads `created_at`.** `Scenario.createdAt` is removed. The store stamps
   `created_at` when it inserts a scenario; an update keeps the stored value. Scenarios are
   still listed in creation order (`ORDER BY created_at, id`, DR-181). A database that holds
   a bad `created_at` loads.
7. **One unreadable scenario no longer blocks startup.** Loading leaves out a scenario row it
   cannot read and lists it on the Scenarios page with a Delete button. The other tables
   stay strict: a scenario is a what-if on top of the portfolio, and leaving one out hides
   no portfolio data. A backup exported while such a row exists contains it, and restore
   refuses that backup, so the notice says to delete the row first.
8. **No migration.** Existing rows load as before. A saved scenario that breaks a rule is
   left out of the compare and refused on its next save until it is fixed.

## Consequences

- Parity, the golden master and the bench budgets are unchanged: valid inputs compute the
  same numbers and no engine logic changes (`Scenario` loses one field).
- User-visible: the scenario form and restore refuse values they accepted before; the
  compare can show a "Not compared" notice; the Scenarios page can list unreadable rows; the
  Value crash help text changes.
- A non-finite value-crash percentage is still not covered by any engine rule. The parser
  cannot produce one today; it is left to the engine track.
