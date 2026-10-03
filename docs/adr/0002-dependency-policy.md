# 0002. Dependency policy

- Status: Accepted
- Date: 2026-09-30 (taken before the refactor programme; recorded in P0)
- Source IDs: D-02

## Context

Every runtime dependency ships inside the offline desktop app and widens its supply-chain surface; dev-only tools do not ship.

## Decision

**Dependencies:** dev-only tools are allowed. A new runtime dependency is allowed only if clearly needed, with a written justification and owner approval at the gate.

## Consequences

Prompts must STOP and ask before adding any runtime dependency.
