# 0014. Multi-step writes in a Rust transaction command

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-14, J-13

## Context

The SQL plugin hands each statement to a pool connection, so BEGIN/COMMIT from JavaScript is not one transaction (finding H-14).

Options considered for J-13 (Transaction mechanism, if H-14 is confirmed): (a) a single SQL batch per operation; (b) a small Rust command that owns the transaction; (c) a pool size of 1. Recommendation at planning: Decide from the P5a step-0 test

## Decision

**Transactions (answers J-13):** option (b) — a small Rust command, using the SQL plugin's pool and `pool.begin()`, owns every multi-step write. Option (a) lost writes in a P01 probe; (c) cannot be configured through the plugin.

## Consequences

P5a adds the command and routes restore, import, assumptions save, migrations and seed through it (DR-020…DR-023). P8 reviews it.
