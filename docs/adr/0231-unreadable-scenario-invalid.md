# 0231. An unreadable scenario row is invalid data like any other

- Status: Accepted
- Date: 2026-11-17
- Source: issue #451 (code review 2026-11, tracking #435); owner decisions 2026-11-16
  (option A, decision text) and 2026-11-17 (option A plus the `SCENARIO_INVALID` handling at
  start-up, the Consequences line and the data-safety note)
- Amends: [0123](0123-scenario-rules-every-entry-point.md) §7 (an unreadable scenario row
  stops start-up; the Scenarios page no longer lists it),
  [0153](0153-honest-startup-failures.md) §2 and §3 (`SCENARIO_INVALID` reaches the startup
  screen, which offers Restore a backup… and no Try again; restore at startup accepts it)
- Related: [0228](0228-read-back-failure-stops.md) (a restore on the startup screen whose
  data cannot be read back)

## Context

Since ADR 0123 §7, loading leaves out a stored scenario row it cannot read and lists it on
the Scenarios page with a Delete button; every other table stops start-up on a row it cannot
read (`ROW_INVALID`). This kept a second, rarely reached path for bad data: a skip-and-collect
loop in the data layer, an `unreadableScenarios` state, a page section with its own texts,
and its tests.

The usual unreadable scenario row is one with bad overrides JSON, which the data layer
raises as `SCENARIO_INVALID`, not `ROW_INVALID`. ADR 0153 treats `SCENARIO_INVALID` as "not
reached at startup": it shows Try again and offers no restore. Removing only the list would
give a Try again loop with no way out on the screen.

## Decision

**0231. An unreadable scenario row is invalid data like any other.** Amends 0123.

1. A stored scenario row the app cannot read stops start-up like an invalid row in any other table: the start-up error screen names the table and row and offers Restore a backup and Show data folder (ADR 0153).
2. Restore keeps checking scenario rows before it writes (no change), so a backup cannot bring such a row in.
3. Removed: the separate "could not be read" list on the Scenarios page with its Delete button, the `unreadableScenarios` state, the `UnreadableScenario` type and the skip-and-collect code in the data layer, the list's texts (en/cs/ru), and their tests.
4. Test, written failing first: a database with a bad scenario row opens on the start-up error screen with the restore offer. Parity targets and golden master do not move.

### Owner additions (2026-11-17)

5. **`SCENARIO_INVALID` is treated like `ROW_INVALID` at start-up.** One shared set,
   `READ_FAILURES = {ROW_INVALID, SCENARIO_INVALID}` in `src/data/errors.ts`, decides it in
   three places:
   - `bootView` (`src/ui/model/bootFailure.ts`): Restore a backup… is offered and Try again
     is not, and the details are "Records involved";
   - the startup screen adds `boot.nextRowInvalid`;
   - `restoreAtStartup` accepts either code and refuses every other one.

   This amends ADR 0153 §2 (the per-code table: `SCENARIO_INVALID` moves to the
   `ROW_INVALID` row) and §3 (restore on the screen is offered for both codes). The database
   migrated to head there and only reading it failed, as for `ROW_INVALID`.

6. ADR 0123 §7 is replaced by item 1. The rest of 0123 is unchanged: restore still refuses a
   backup that holds a scenario row it cannot read (0123 §4), and a readable scenario that
   breaks an engine rule is still left out of the compare (0123 §5).

## Consequences

- No figure, parity target or golden-master change; no schema, migration or backup-format
  change. `backup.ts` is unchanged.
- Without a backup, the row must be removed by hand or reported: the screen's Restore a
  backup… has nothing to pick, and the properties, loans and leases stay unreachable in the
  app until then. Nothing on disk is lost. Any future change to the scenario overrides format
  ships with a schema migration, so an older app stops on `DB_NEWER` instead.
- A backup the app exports can no longer contain an unreadable scenario row, because the app
  does not start with one; so every backup the app writes restores.
- Removed dictionary key (en/cs/ru): `scenarios.unreadableRow`. No key is added; the
  existing `dataErrors.SCENARIO_INVALID` and `boot.nextRowInvalid` texts show on the screen.
- No ux-capture screen shows the removed list, so no screen changes.
- `docs/data-safety.md` and `SPEC.md` say that an unreadable scenario stops start-up and
  offers Restore a backup….
