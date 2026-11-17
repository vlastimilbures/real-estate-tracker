#!/usr/bin/env bash
# ADR 0196: src-tauri/vendor/sqlx-sqlite must be the crates.io sqlx-sqlite 0.8.6 source with
# exactly one change, the libsqlite3-sys bound in its Cargo.toml. Checks first that
# Cargo.lock resolves sqlx-sqlite to that vendored copy (no network), then downloads the
# published crate, checks its checksum (the one Cargo.lock recorded before the patch), and
# compares.
#   scripts/check-vendored-sqlx-sqlite.sh              the lock check, then the download
#   scripts/check-vendored-sqlx-sqlite.sh --lock-only  the lock check only
# SQLX_CARGO_LOCK names another Cargo.lock to check (the tests use it).
set -euo pipefail

VERSION=0.8.6
SHA256=c2d12fe70b2c1b4401038055f90f151b78208de1f9f89a7dbfd41587a10c3eea
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VENDOR="$ROOT/src-tauri/vendor/sqlx-sqlite"
LOCK=${SQLX_CARGO_LOCK:-$ROOT/src-tauri/Cargo.lock}

# The patch is in use only when the lock has exactly one sqlx-sqlite: $VERSION with no
# `source` line (a path dependency), and no [[patch.unused]] entry naming it. A registry
# entry means the build takes crates.io's copy, not the vendored one. POSIX awk (mawk too):
# RS="" reads one blank-line-separated block per record.
check_lock() {
  local found
  if ! found=$(awk -v want="$VERSION" '
    BEGIN { RS = ""; packages = 0; vendored = 0; unused = 0 }
    {
      n = split($0, line, "\n")
      named = 0; version = ""; source = 0
      for (i = 2; i <= n; i++) {
        if (line[i] == "name = \"sqlx-sqlite\"") named = 1
        else if (line[i] ~ /^version = /) version = line[i]
        else if (line[i] ~ /^source = /) source = 1
      }
      if (!named) next
      if (line[1] == "[[package]]") {
        packages++
        print "  [[package]] " version (source ? " (registry)" : " (path)")
        if (version == "version = \"" want "\"" && !source) vendored++
      } else if (line[1] == "[[patch.unused]]") {
        unused++
        print "  [[patch.unused]] " version
      }
    }
    END { exit !(packages == 1 && vendored == 1 && unused == 0) }
  ' "$LOCK"); then
    echo "Cargo.lock does not use the vendored sqlx-sqlite $VERSION (ADR 0196): it needs" >&2
    echo "exactly one [[package]] sqlx-sqlite $VERSION without a source line, and no" >&2
    echo "[[patch.unused]] for it. Found in $LOCK:" >&2
    echo "${found:-  no sqlx-sqlite entry}" >&2
    exit 1
  fi
}

check_lock
if [[ "${1:-}" == "--lock-only" ]]; then
  echo "Cargo.lock uses the vendored sqlx-sqlite $VERSION (ADR 0196)"
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -sSfL "https://static.crates.io/crates/sqlx-sqlite/sqlx-sqlite-$VERSION.crate" \
  -o "$TMP/crate.tar.gz"
echo "$SHA256  $TMP/crate.tar.gz" | shasum -a 256 -c - >/dev/null
tar -xzf "$TMP/crate.tar.gz" -C "$TMP"
UPSTREAM="$TMP/sqlx-sqlite-$VERSION"

expected='82c82
< version = "0.30.1"
---
> version = ">=0.30.1, <0.40.0"'

# Every file other than Cargo.toml must be byte-identical, with none added or missing.
if ! diff -r -q -x Cargo.toml "$UPSTREAM" "$VENDOR"; then
  echo "vendored sqlx-sqlite differs from crates.io $VERSION outside Cargo.toml" >&2
  exit 1
fi
actual=$(diff "$UPSTREAM/Cargo.toml" "$VENDOR/Cargo.toml" || true)
if [[ "$actual" != "$expected" ]]; then
  echo "vendored sqlx-sqlite Cargo.toml: expected only the libsqlite3-sys bound change, got:" >&2
  echo "$actual" >&2
  exit 1
fi
echo "vendored sqlx-sqlite $VERSION: one-line patch only (ADR 0196)"
