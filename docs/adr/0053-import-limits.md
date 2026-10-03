# 0053. Import and restore size limits

- Status: Accepted
- Date: 2026-10-01
- Source IDs: D-53

## Context

Unbounded files could exhaust memory or freeze the UI during parsing.

## Decision

**Import/restore limits (P5b plan, DR-089):** a CSV file may hold at most 2 MB and 5,000 data rows; a backup JSON at most 20 MB. Larger files are rejected with a precise message before parsing.

## Consequences

P5b steps 3 and 5; user-visible under D-01 (UX-009, UX-014).
