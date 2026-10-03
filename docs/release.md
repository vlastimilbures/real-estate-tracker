# Releasing the macOS app

The app ships as an **ad-hoc-signed** Apple Silicon build (ADR 0009, ADR 0063): free, fine for the
owner's own Mac, no Apple Developer account. Minimum macOS 13. No App Sandbox (hardened
runtime only, ADR 0063).

## Checklist

1. **Back up the database** (Settings → Backup & Restore → Export backup), and keep a copy of
   the installed app you are replacing.
2. **Version bump** — `package.json` is the single source: `tauri.conf.json` reads it
   (`"version": "../package.json"`). Set the same number in `src-tauri/Cargo.toml`; the release
   script refuses to build if they differ.
3. **Changelog** — move the `Unreleased` notes in `CHANGELOG.md` under the new version and
   date.
4. **Build, sign, verify** — `scripts/release-macos.sh`. It runs typecheck, lint, the JS and
   Rust tests, `cargo fmt --check`, `cargo clippy -D warnings` and `cargo audit`, then
   `pnpm tauri build --target aarch64-apple-darwin`, and verifies the result:
   - `codesign --verify --deep --strict --verbose=2` passes;
   - `Signature=adhoc` and the `runtime` (hardened runtime) flag are present;
   - the binary is `arm64` only and `LSMinimumSystemVersion` is `13.0`.

   Artefacts: `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Real Estate Tracker.app`
   and `…/bundle/dmg/Real Estate Tracker_<version>_aarch64.dmg` (the script prints its SHA-256).

5. **Install and smoke-test** — open the dmg, drag the app to Applications, open it. Check:
   the data is there; it works with Wi-Fi off; no light flash on start in dark mode; an export
   saves; the window reopens where you left it.
6. **Commit and tag** — `git tag v<version>` on the release commit, push the tag.
   The `Release (macOS)` workflow then builds and verifies the bundle on a macOS runner and
   attaches the dmg to the tag's GitHub release (creating the release if needed).

The script never launches the app and never touches the database.

## Gatekeeper on another Mac

An ad-hoc signature is not trusted by Gatekeeper, so a copy downloaded or moved to another Mac
is blocked on first open ("cannot be opened because Apple cannot check it…"). To allow it:

- **macOS 15 and later:** open the app once (it is blocked), then go to **System Settings →
  Privacy & Security**, scroll to Security, click **Open Anyway** next to the app's message and
  confirm with your password.
- **macOS 13–14:** Control-click the app in Finder → **Open** → **Open**.

On the Mac that built it, the app opens normally (no quarantine attribute).

## Where the app keeps data

| What                                    | Location                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Database (`portfolio.db` + `-wal/-shm`) | `~/Library/Application Support/com.bures.realestate-tracker/`                   |
| Pre-migration and pre-restore backups   | `~/Library/Application Support/com.bures.realestate-tracker/backups/`           |
| Window size/position                    | `~/Library/Application Support/com.bures.realestate-tracker/.window-state.json` |
| Error log (rotating, 5 × 1 MB)          | `~/Library/Logs/com.bures.realestate-tracker/app.log`                           |

The database runs in WAL mode: committed data can sit in `portfolio.db-wal` until a checkpoint.
To back it up, use **Settings → Backup & Restore → Export backup** (a consistent JSON copy) or
quit the app first and copy `portfolio.db` together with its `-wal` and `-shm` files. Copying
`portfolio.db` alone while the app runs can miss recent changes. Pre-migration copies are made
with `VACUUM INTO` and are always consistent.

The app folder is `0700` and every file in it and in `backups/` is `0600`: the app sets these
modes at every start and writes its backups `0600` (ADR 0080), so only your user can read them. **Encryption at rest
is not provided** (backlog): FileVault protects the disk as a whole.

## Security posture

- The webview gets only the permissions in `src-tauri/capabilities/default.json`: listening
  for native-menu events, the SQL plugin's load/execute/select, and the app's own commands.
  There is no fs, dialog, shell, http, opener or updater permission; file dialogs and file
  writes happen in Rust (`src-tauri/src/files.rs`).
- A strict CSP (`tauri.conf.json` → `app.security.csp`) allows only the app's own scripts and
  styles and IPC; there are no remote origins. A navigation guard (`src-tauri/src/nav.rs`)
  refuses any navigation away from the app.
- Devtools are not compiled into release builds (no `devtools` cargo feature).
- `sql:allow-load` stays (ADR 0064): the webview could open another SQLite file, but no remote
  content can run in it.

### Manual check: an outside request is blocked

In a dev build (`pnpm tauri dev`, devtools available via right-click → Inspect), run in the
console:

```js
fetch("https://example.com").then(
  () => console.log("NOT BLOCKED"),
  (e) => console.log("blocked:", e.message),
);
```

Expected: `blocked: …` and a CSP `connect-src` violation in the console.

## Optional: Developer ID signing and notarisation

Not used today (ADR 0009). With an Apple Developer account, Tauri signs and notarises during
`tauri build` from environment variables — nothing is committed:

| Variable                 | Value                                                               |
| ------------------------ | ------------------------------------------------------------------- |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: <Name> (<TEAMID>)` (from your keychain)  |
| `APPLE_API_ISSUER`       | App Store Connect API issuer ID                                     |
| `APPLE_API_KEY`          | App Store Connect API key ID                                        |
| `APPLE_API_KEY_PATH`     | Path to the downloaded `AuthKey_<KEYID>.p8` (keep outside the repo) |

Set `bundle.macOS.signingIdentity` back to `null` (the env var then wins) or to the identity,
build, then verify:

```sh
spctl -a -vvv -t exec "Real Estate Tracker.app"          # accepted, source=Notarized Developer ID
spctl -a -vvv -t open --context context:primary-signature "Real Estate Tracker_<v>_aarch64.dmg"
xcrun stapler validate "Real Estate Tracker.app"
```

Never commit certificates, `.p8` keys or passwords.
