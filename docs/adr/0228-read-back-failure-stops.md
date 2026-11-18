# 0228. A save whose read-back fails stops on the error screen

- Status: Accepted
- Date: 2026-11-16
- Source: issue #446 (code review 2026-11, tracking #435), owner decision 2026-11-16
  (option A)
- Amends: [0125](0125-committed-write-reload-failure.md) (§1, §3, §5: the stale state and
  the in-memory assumptions), [0191](0191-state-fixes-preset-match.md)
  §2 (the in-memory scenario list), [0194](0194-banners-once-purchases-column.md)
  (§1: the stale banner), [0132](0132-reload-export-write-order.md) (§1: the banner's
  Reload), [0153](0153-honest-startup-failures.md) §3 (a restore on the screen whose data
  cannot be loaded), [0154](0154-one-outcome-path.md) §5 (the startup screen names the
  safety copy)
- Related: [0147](0147-failure-messages-and-log.md)
- Implementation: dictionary key `boot.readBackFailed` (en/cs/ru)

## Context

Every write commits, then reads all data back for the screen. Since ADR 0125 a read-back
that fails after the commit keeps the write reported as saved and sets a `stale` flag: a
banner with a Reload button says the screen may not show what is saved. The app stays
editable while it shows data older than the database. To limit the harm, the store patches
the saved assumptions (0125 §5) and the scenario list (0191 §2) into memory, and the
banner's Reload is queued behind pending writes (0132 §1). Every other table stays stale, so
a form can save the old values it still shows.

## Decision

**0228. A save whose read-back fails stops on the error screen.** Amends 0125, 0191 §2, 0194 (the stale banner) and 0132 (the banner's Reload).

1. When a change is written to the database but reading the data back fails, the app does not continue editing. It shows the existing startup error screen with a new message: "Your last change was saved, but the data could not be read back." It offers _Try again_ (reads the data again and returns to the page the owner was on) and _Show data folder_.
2. The change itself stays reported as saved; nothing is undone or written twice.
3. Removed: the stale-data banner and its Reload button, `stale` and `staleEpisode`, the in-memory patching of assumptions and the scenario list (`mutateScenarios`, `upsertIn`), and the banner texts (en/cs/ru), with their tests. Scenario edits use the ordinary write path.
4. A restore whose read-back fails ends on the same screen (today: a "restored but reload failed" text).
5. Tests, written failing first: a committed write whose read-back fails shows the screen and the change is in the database; _Try again_ returns to the app when the read succeeds. Parity targets and golden master do not move.

Runs before #465 (store split).

### Decisions taken in the night run 2026-11-16 (owner reviewed 2026-11-18)

- **A failed write whose read-back also fails** commits nothing, so the app stays where it
  is and shows the write error; the reload failure is only logged (`RELOAD`). The screen's
  "your last change was saved" would be false there.
- **Writes queued behind the failed one are refused** while the screen shows, and are not
  written: the safe reading of "does not continue editing".
- **The safety copy stays named.** After a restore or Clear sample whose read-back fails,
  and while _Try again_ keeps failing, the screen names the safety copy under the message
  (ADR 0154 §5, #136). This replaces `boot.restoredReloadFailed`.
- _Try again_ on this screen only reads: it does not reopen, migrate or seed the database
  (ADR 0153's startup path is unchanged). The existing heading stays.
- Amends also 0153 §3 and 0154 §5; the decision text is unchanged.

## Consequences

- No figure, parity target or golden-master change; no schema, migration or backup-format
  change.
- Removed dictionary keys (en/cs/ru): `common.staleData`, `common.reload` and
  `boot.restoredReloadFailed`. Added: `boot.readBackFailed`.
- The app never shows data older than the database while it can be edited.
- `ErrorBanner` loses its unused `action` button.
- When the read keeps failing, its cause is in `app.log` under `RELOAD`, as before.
