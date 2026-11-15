#!/usr/bin/env bash
# ADR 0196: src-tauri/vendor/sqlx-sqlite must be the crates.io sqlx-sqlite 0.8.6 source with
# exactly one change, the libsqlite3-sys bound in its Cargo.toml. Downloads the published
# crate, checks its checksum (the one Cargo.lock recorded before the patch), and compares.
set -euo pipefail

VERSION=0.8.6
SHA256=c2d12fe70b2c1b4401038055f90f151b78208de1f9f89a7dbfd41587a10c3eea
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VENDOR="$ROOT/src-tauri/vendor/sqlx-sqlite"
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
