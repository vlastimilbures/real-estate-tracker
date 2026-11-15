# 0196. Bundled SQLite 3.54 through a vendored sqlx-sqlite patch (RUSTSEC-2026-0459)

- Status: Accepted
- Date: 2026-11-15
- Source: RUSTSEC-2026-0459 / CVE-2026-119375 (`cargo audit` fails CI on every PR); owner
  decision 2026-11-15 (vendored one-line patch, together with the open Dependabot updates)
- Related: [0002](0002-dependency-policy.md) (runtime dependencies), [0014](0014-rust-transaction-command.md) (`db.rs`
  transactions on the plugin's pool), DR-002 (`src-tauri/.cargo/audit.toml`: ignore entries are only for lock-only crates)

## Context

1. The app bundles SQLite through libsqlite3-sys 0.30.1 (SQLite 3.46, `bundled` feature,
   compiled in). The chain is tauri-plugin-sql 2.5.0 → sqlx 0.8.6 → sqlx-sqlite 0.8.6,
   which pins `libsqlite3-sys = "0.30.1"`. Our own `sqlx = "0.8"` must stay on the plugin's
   version. RUSTSEC-2026-0459 is fixed in libsqlite3-sys 0.39.0 and later (SQLite 3.54).
2. No released crate fixes it:
   - tauri-plugin-sql 2.5.0, 2.6.0 (the newest 2.x, which this change also moves to) and
     3.0.0-alpha.3 all require `sqlx ^0.8`, and the 3.0 alpha also needs tauri 3;
   - sqlx 0.9.0 allows only `libsqlite3-sys <0.38`;
   - sqlx raised the bound to `<0.40` on 2026-11-08 (launchbadge/sqlx#4502, a one-line
     Cargo.toml change), but only on the unreleased 0.9.1 branch. The plugin would also
     have to move to 0.9.
3. Exposure: a local attacker must plant a database together with a mismatched `-wal` file.
   The app opens only its own `portfolio.db` (0600, app folder), and backups are JSON. The
   risk is low, but the code is compiled in, so the advisory is not ignored (DR-002).
4. A probe build confirmed the fix: sqlx 0.8.6 with sqlx-sqlite's bound widened to
   `>=0.30.1, <0.40.0` compiles against libsqlite3-sys 0.39.1. It runs a WAL database,
   a transaction and a read on SQLite 3.54.1.

## Decision

1. **Vendor sqlx-sqlite 0.8.6** under `src-tauri/vendor/sqlx-sqlite/` (the unmodified
   crates.io source plus its licence files). It carries one change: the libsqlite3-sys bound in its
   `Cargo.toml` becomes `">=0.30.1, <0.40.0"`, matching upstream #4502. Wire it in with
   `[patch.crates-io] sqlx-sqlite = { path = "vendor/sqlx-sqlite" }`. Use a path, not a
   git dependency: the build stays offline, and the diff can be reviewed in this repo.
2. **Lock `libsqlite3-sys` at 0.39.1** with `cargo update -p libsqlite3-sys --precise
0.39.1`. It is not a direct dependency; `Cargo.lock` changes in that crate and in
   sqlx-sqlite's source only.
3. **Nothing else changes.** tauri-plugin-sql, sqlx, `db.rs`, the plugin migrations,
   the capabilities and the CSP stay as they are. The database file format is unchanged
   (SQLite 3.46 → 3.54 is backward and forward compatible for our schema), so stored data
   does not change. MSRV: libsqlite3-sys 0.39 needs Rust 1.88, and the toolchain is 1.96.
4. **Exit.** Remove the patch and the vendor folder once a tauri-plugin-sql release uses a
   sqlx that allows libsqlite3-sys ≥0.39 (sqlx ≥0.9.1). Dependabot's ignore on sqlx 0.9
   stays until then. CI runs `scripts/check-vendored-sqlx-sqlite.sh` in the Rust job: it
   downloads the published 0.8.6 crate, checks the checksum Cargo.lock recorded for it, and
   fails if `vendor/sqlx-sqlite` differs from it in anything other than that one line.
5. This is not a new runtime dependency. It is the same crate with a widened version range,
   plus an upgrade of an existing transitive crate. Under ADR 0002 it is reviewed by the owner in its PR.

## Consequences

- CI turns green without an audit ignore entry, and the shipped app bundles SQLite 3.54.1.
- We own a vendored copy of the crate until upstream catches up. Its diff is one line and
  a CI check guards it.
- `src-tauri/tests/sqlite_version.rs` asserts `sqlite_version() >= 3.54.0` and runs a
  transaction on a WAL database; it failed on 3.46.0 before the patch.
