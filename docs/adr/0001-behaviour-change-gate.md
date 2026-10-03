# 0001. Behaviour changes need an approval gate

- Status: Accepted
- Date: 2026-09-30 (taken before the refactor programme; recorded in P0)
- Source IDs: D-01

## Context

The owner relies on the app's numbers, and the parity targets are the regression baseline. Refactoring and fixing at the same time makes it impossible to tell an intended change from a regression.

## Decision

**Behaviour changes need an approval gate.** Claude may _propose_ fixes to spec contradictions or bugs. Nothing that changes a number **or any other user-visible behaviour** ships without owner sign-off **and** new tests.

## Consequences

Refactor commits must be behaviour-neutral. Fixes go in separate commits, each referencing a decision ID.
