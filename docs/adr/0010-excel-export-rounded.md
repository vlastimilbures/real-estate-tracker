# 0010. Excel export writes rounded values

- Status: Accepted
- Date: 2026-09-30 (taken before the refactor programme; recorded in P0)
- Source IDs: D-10
- Amended by: [0145](0145-xlsx-finite-and-text-format.md)

## Context

Exported spreadsheets were compared against what the app shows; full-precision values made them differ in the last digit.

## Decision

**Excel export writes rounded values** that match exactly what the app displays.

## Consequences

P5b keeps or implements display-consistent rounding. Formula-injection protection applies to **text cells only**.
