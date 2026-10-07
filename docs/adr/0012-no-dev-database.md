# 0012. No separate development database

- Status: Superseded by 0081
- Date: 2026-09-30 (taken before the refactor programme; recorded in P0)
- Source IDs: D-12

## Context

The owner keeps a separate app copy and database backups; a second database would add configuration without adding safety.

## Decision

**No separate development database.** The owner keeps a separate app copy and database backups.

## Consequences

Standing Rule 11 requires the owner to confirm that a backup is current before any phase that runs the app or a migration.
