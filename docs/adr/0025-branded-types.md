# 0025. Branded IsoDate and Rate types in the engine API

- Status: Accepted
- Amended by: [0074](0074-type-safety-pass.md) (`Money` brand on engine inputs)
- Date: 2026-09-30
- Source IDs: D-25, J-08

## Context

The defects found in the mortgage audit were date and calendar defects that plain strings and numbers could not catch (J-08).

Options considered for J-08 (Branded types (`Money`, `Rate`, `IsoDate`)): (a) introduce them across the engine API; (b) skip. Recommendation at planning: (a), in the engine only. P02 recommendation: see P02-mortgage-audit.md §7

## Decision

**Branded types (answers J-08):** option (a), limited to `IsoDate` and `Rate`, in the engine API only (P02: the defects found are date/calendar defects).

## Consequences

P4a introduces them behaviour-neutrally.
