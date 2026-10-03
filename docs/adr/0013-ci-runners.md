# 0013. CI runners: Linux for checks, macOS only for the bundle

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-13, Q-02

## Context

GitHub-hosted macOS minutes are billed at a higher rate; most checks do not need macOS (Q-02).

Options considered for Q-02 (GitHub-hosted macOS runners acceptable?): (a) macOS runners (higher per-minute cost); (b) lint + tests on Linux (needs `webkit2gtk`/`libsoup` for Rust checks), build only on macOS. Recommendation at planning: See P00 report §7

## Decision

**CI runners (answers Q-02):** keep lint, typecheck, tests, fmt and clippy on GitHub-hosted Linux runners (as today); add a single macOS job only for the Tauri `.app` bundle build.

## Consequences

P3 adds the minimal gate on Linux; P10 adds the macOS bundle job (on PRs to main or nightly).
