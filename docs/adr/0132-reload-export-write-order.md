# 0132. The banner Reload and the backup export follow the write order

- Status: Accepted
- Date: 2026-10-04
- Source: issues #138 (2026-10 code review: R3-05, R6-03, G2-4-02, R4-13, G2-4-08) and
  #199 (independent review of PR #196, NIT 3)
- Related: [0125](0125-committed-write-reload-failure.md) (committed write whose reload
  fails), [0110](0110-backup-recency-indicator.md) (backup recency),
  [0052](0052-restore-safety-backup.md) (restore safety backup),
  [0066](0066-performance-budgets.md) (DR-134: one snapshot for the load),
  [0014](0014-rust-transaction-command.md) (one transaction per write)

## Context

The store runs every write, and the reload after it, through one queue (DR-085): a write
starts only after the previous one settled, and its reload never overlaps another write.
Two paths stepped outside that order.

- **Backup export.** The export read the seven backup tables with seven separate queries,
  then the schema version with an eighth. A write that committed between two of them gave a
  file that mixed two database states. Such a file could fail its own restore check (child
  rows without their property), or restore with records silently missing. The export
  reported success either way. The safety backups taken before Restore and Clear sample use
  the same reader; they run inside the queue, so they were safe, but only by position.
- **Banner Reload.** The stale banner's Reload read the data straight away, outside the
  queue. When a write was in flight, a Reload could read the old data before the write
  committed and finish after the write's own reload. It then put the old data back on the
  screen and cleared the banner. Since ADR 0125 this could also put back the assumptions a
  stale save had just shown.

The queue itself was written out by hand three times, with two different tails, and no test
pinned that a safety backup waits for a write queued before it.

## Decision

Owner, 2026-10-04 (Track 8 PR4 plan; option A of #138 and #199, option C of #138 declined,
#200 left as is):

1. **The banner Reload waits for pending writes.** It runs in the write queue, so it reads
   only after every write queued before it has committed and reloaded. The reload that each
   write runs after its own commit stays inside that write's turn in the queue.
2. **The export and the safety backups read one snapshot.** All seven tables and the
   schema version are read in one read transaction (the DR-134 mechanism the load already
   uses). A write that lands during an export is either wholly in the file or wholly out of
   it.
3. **The export itself is not queued.** It never waits for edits, and its save dialog never
   holds them up. A write that commits while an export runs keeps the "changed since last
   backup" flag on, as ADR 0110 already says; the count of writes is taken before the
   snapshot, so the flag can stay on when the file has the write, never go off when it does
   not.
4. **One queue helper.** Every queued job (form writes, whole-database actions, the CSV
   preview, the banner Reload) goes through one helper with one tail rule. A test pins that
   the Restore and Clear sample safety backups include a write queued before them.

## Consequences

- Parity, the golden master and the bench budgets are unchanged: no engine logic changes.
- No text changes. The banner and its Reload button look the same.
- A Reload clicked while a write runs takes effect after it: milliseconds after a form save,
  seconds after a large CSV import or restore.
- Saved assumptions shown while the screen is stale (ADR 0125 §5) can no longer be replaced
  by an older Reload: a queued Reload starts its read only after the save committed, so it
  reads the saved row.
- An exported file holds one moment of the database. It still does not hold a write queued
  before the click but not yet committed; such a write keeps the changed flag on.
- When the reload keeps failing, the banner still does not name the cause (#200: owner chose
  to leave it, as ADR 0125 Consequences say).
