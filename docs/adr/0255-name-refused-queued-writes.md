# 0255. The read-back error screen names the queued writes it refused

- Status: Accepted
- Date: 2026-11-18
- Source: issue #446 (code review 2026-11, tracking #435); owner decision 2026-11-18 (#435
  comment 6965976270: "name the refused queued write on the error screen (copy and ADR)");
  plan on #446 (comment 6974150604)
- Amends: [0228](0228-read-back-failure-stops.md) (night-run decision "Writes queued
  behind the failed one are refused": the screen now names them)
- Related: [0253](0253-row-actions-disabled-while-writing.md) (the write queue and its
  three entry points), [0154](0154-one-outcome-path.md) §5 (the screen names the safety
  copy), [0157](0157-accessibility-batch.md) (the screen's landmark and heading),
  [0248](0248-focus-after-busy-actions.md) (focus after a busy action, unchanged)
- Implementation: dictionary key `boot.notSaved` (en/cs/ru); text approved by the owner
  2026-11-18 (#564 comment 6975468652; `docs/decisions/wording.md`, 2026-11-18 · #446)

## Context

Since ADR 0228 a write that commits but whose read-back fails stops the app on the startup
error screen (`boot.readBackFailed`). Writes already queued behind it are refused while the
screen shows: `mutate` returns `{ ok: false }`, and `exclusive` and `replaceData` throw
before their operation runs. The screen said nothing about them.

Example on the sample portfolio: the owner saves a valuation on _Byt Lipova_, then its
lease a moment later. The valuation commits, the read-back fails, and the screen says the
last change was saved. After _Try again_ the lease is gone without a word.

This needs a read-back failure and a second write queued in the same few milliseconds, so
it practically never happens. The owner chose to name what was dropped rather than leave
it silent.

## Decision

1. **Each write names what it changes.** `mutate`, `exclusive` and `replaceData` take a
   `WriteTarget` (`src/state/writeTargets.ts`):
   - a data table, named by the backup table keys: `properties`, `mortgage_blocks`,
     `valuations`, `leases`, `holding_costs`, `assumptions`, `scenarios`;
   - a whole-database action: `importCsv`, `restore`, `clearSample`, `loadSample`;
   - `bookkeeping`: recording an export (`recordBackup`) and dismissing the sample banner.
2. **The store keeps the refused ones.** A write refused because a read-back failed adds
   its target to `refusedWrites`, once each, in the order refused. Bookkeeping is not
   added: the backup file itself is saved, and the banner is app state, not data. A
   successful _Try again_ empties the list; one that fails again keeps it. A write refused
   because no database is open is not added. Nothing else changes: the refusals return and
   throw as before, and `writesRunning` (ADR 0253) counts them as before.
3. **Names come from existing dictionary entries**, through `refusedWriteLabels()` in
   `src/ui/model/bootFailure.ts`: a table by `backup.tables.*` (the names the restore
   confirm lists), `importCsv` by `common.importCsv`, `restore` by `backup.restoreTitle`,
   `clearSample` by `sample.confirm` and `loadSample` by `sample.loadAction`.
4. **The screen lists them.** When `refusedWrites` is not empty, the read-back branch shows,
   under `boot.readBackFailed` and before the safety copy's name, one line `boot.notSaved`
   and the names as a list in the existing `error-screen-details` markup. Both are inside
   the screen's `role="alert"`, so they are live-region text: hence this ADR and the
   `wording.md` entry. With nothing refused the screen is unchanged.
5. **New copy, one key `boot.notSaved`** (en/cs/ru), its text approved by the owner on
   2026-11-18 (`wording.md`).

Defaults chosen in the plan; the owner may change them:

- Bookkeeping writes are not named (§2).
- `boot.readBackFailed` keeps its text; the list makes clear which changes were not
  saved.
- The restore or Load sample failure banner shown after _Try again_ (the refused action's
  own error) stays.
- The alert is not re-mounted when the list arrives a render after the screen: a write
  refused later only adds to the alert's text.

Tests, written failing first in new files: `src/state/__tests__/refusedWrites.test.ts`,
`src/ui/model/__tests__/refusedWriteLabels.test.ts` and
`src/ui/__tests__/BootFailureRefused.test.tsx`. The ADR 0228 tests stay unchanged.

## Consequences

- No figure, parity target, golden master, schema, export or backup-format change.
- Added dictionary key (en/cs/ru): `boot.notSaved`. No key is removed or reworded.
- The screens ux-capture shows are unchanged: none has a refused write.
- A refactor first moves the store's write runner into `createWriteRunner` and the
  read-back branch into `ReadBackText`, so the function size baseline only shrinks.
