# 0063. Hardened runtime, Apple Silicon only, macOS 13+

- Status: Accepted
- Date: 2026-10-01
- Source IDs: D-63, J-10, Q-05

## Context

App Sandbox would move the data folder into a container (J-10); target Macs and minimum macOS were open (Q-05).

Options considered for J-10 (App Sandbox entitlement): (a) sandboxed (security-scoped bookmarks; moves the data folder into a container, one-time data move); (b) hardened runtime only. Recommendation at planning: (b) for now; revisit later

Options considered for Q-05 (Target Macs and minimum macOS): Apple Silicon only / universal (Intel + Apple Silicon); minimum macOS 12?

## Decision

**P7c gate (2026-10-01, answers J-10 and Q-05):** P7c approved as delivered (UX-026…044 Tier 2, UX-053…063). J-10 = (b) hardened runtime only, no App Sandbox for now. Q-05 = Apple Silicon only, minimum macOS 13. DR-060 = Won't fix (Recharts needs plain numbers; the conversion stays in `toChartRows`). New cs/ru wording accepted. Phase 7 closed.

## Consequences

P7c merges; P8 (Tauri/Rust security, signing & release) next, with J-10 (b) and Q-05 as inputs.
