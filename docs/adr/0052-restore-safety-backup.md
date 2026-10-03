# 0052. Restore safety backup

- Status: Accepted
- Date: 2026-10-01
- Source IDs: D-52

## Context

A restore replaces all data; it must be undoable and must not proceed if the safety copy fails.

## Decision

**Restore safety backup (P5b plan, DR-019, DR-136):** keep it as JSON (restorable from the Restore screen), written to `app_config_dir/backups` (the DB's own dir) as a temp file renamed into place, then read back and checked against the live per-table row counts before anything is replaced.

## Consequences

P5b step 5.
