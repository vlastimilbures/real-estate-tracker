# 0006. Hardening scope; E2E stays optional

- Status: Accepted
- Date: 2026-09-30 (taken before the refactor programme; recorded in P0)
- Source IDs: D-06

## Context

Security, signing and CI gates were in scope; a large Playwright suite against a Tauri webview is costly to keep stable for a single-user app.

## Decision

**Hardening scope:** Tauri/Rust security, signing & release, CI quality gates. **E2E (Playwright) stays optional**: keep existing tests green, do not expand them.

## Consequences

P8 and P10 are in scope; no new E2E suites.
