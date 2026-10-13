# 0064. File IO in Rust commands

- Status: Accepted
- Date: 2026-10-01
- Source IDs: D-64

## Context

The webview held fs and dialog permissions and passed file paths, which widened the attack surface.

## Decision

**P8 plan (owner, 2026-10-01):** (1) File IO moves into app Rust commands (`save_file`, `open_backup_file`, `write_app_backup`): Rust opens the dialogs and writes temp + rename, so the webview never passes a file path; the fs plugin and all fs/dialog permissions are removed (fixes DR-050, DR-138, DR-139). (2) `sql:allow-load` stays (no preload): accepted risk, documented; a DB open failure keeps the in-app error screen. (3) About links (GitHub, e-mail) become plain selectable text (UX-064). (4) DR-142 window size/position restore via the official `tauri-plugin-window-state` (new runtime dependency — justification: the official Tauri plugin, Rust-only, no JS package and no webview permission; writing it by hand would duplicate its multi-monitor handling) (UX-065). (5) DR-143 native menu shortcuts (UX-066). (6) DR-002: `cargo update` within semver ranges to clear advisories (upgrades Rust runtime crates; no manifest range widened).

## Consequences

P8 scope.

Note (2026-10-13, #171): the risk accepted in point (2) is wider than opening another SQLite
file. With `sql:allow-execute`, and through `db_transaction` as well, the webview can run any
SQL, including `ATTACH DATABASE` to any path the user can write. It stays accepted because no
remote content can run in the webview. ADR 0175 §7's refusal of transaction control in the
app's `execute` wrapper is a tripwire against mistakes, not a security guard.
