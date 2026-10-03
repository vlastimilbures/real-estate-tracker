#!/usr/bin/env bash
# Build, ad-hoc sign and verify the macOS release (P8, D-09, D-63: Apple Silicon only,
# macOS 13+). Usage: scripts/release-macos.sh [--skip-checks]
# Never launches the app and never touches the database. See docs/release.md.
set -euo pipefail

cd "$(dirname "$0")/.."
TARGET=aarch64-apple-darwin
BUNDLE_DIR="src-tauri/target/$TARGET/release/bundle"

step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'release: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == Darwin ]] || fail "macOS only"

step "Version agreement (package.json is the single source; Cargo.toml must match)"
pkg_version=$(node -p "require('./package.json').version")
cargo_version=$(sed -n 's/^version = "\(.*\)"$/\1/p' src-tauri/Cargo.toml | head -1)
conf_version=$(node -p "require('./src-tauri/tauri.conf.json').version")
[[ "$conf_version" == "../package.json" ]] || fail "tauri.conf.json version must be \"../package.json\""
[[ "$pkg_version" == "$cargo_version" ]] ||
  fail "package.json $pkg_version != src-tauri/Cargo.toml $cargo_version"
echo "version $pkg_version"

if [[ "${1:-}" != "--skip-checks" ]]; then
  step "Checks"
  pnpm typecheck
  pnpm lint
  pnpm test
  cargo fmt --check --manifest-path src-tauri/Cargo.toml
  cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
  cargo test --manifest-path src-tauri/Cargo.toml
  (cd src-tauri && cargo audit)
fi

step "Build ($TARGET, ad-hoc signed per tauri.conf.json)"
rustup target list --installed | grep -qx "$TARGET" || rustup target add "$TARGET"
pnpm tauri build --target "$TARGET"

APP=$(find "$BUNDLE_DIR/macos" -maxdepth 1 -name '*.app' | head -1)
DMG=$(find "$BUNDLE_DIR/dmg" -maxdepth 1 -name '*.dmg' | head -1)
[[ -n "$APP" && -n "$DMG" ]] || fail "bundle not found under $BUNDLE_DIR"

step "Verify signature"
codesign --verify --deep --strict --verbose=2 "$APP"
info=$(codesign -dv "$APP" 2>&1)
grep -E '^(Identifier|Format|CodeDirectory|Signature)' <<<"$info"
grep -q '^Signature=adhoc' <<<"$info" || fail "not ad-hoc signed"
grep -q 'flags=.*runtime' <<<"$info" || fail "hardened runtime flag missing"
archs=$(lipo -archs "$APP/Contents/MacOS/"*)
[[ "$archs" == arm64 ]] || fail "binary architectures are '$archs', expected arm64 only"
min_os=$(plutil -extract LSMinimumSystemVersion raw "$APP/Contents/Info.plist")
[[ "$min_os" == 13.0 ]] || fail "LSMinimumSystemVersion is '$min_os', expected 13.0"
echo "arm64 only, minimum macOS $min_os"

step "Artefacts"
echo "$APP"
echo "$DMG"
shasum -a 256 "$DMG"
