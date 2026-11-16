# 0233. The release build measures timings only when asked

- Status: Accepted
- Date: 2026-11-16
- Source: issue #453 (code review 2026-11, tracking #435), owner decision 2026-11-16
  (replacing option A)
- Amends: [0066](0066-performance-budgets.md) (how the budgets are measured; the budgets stay)

## Context

Since ADR 0066 the release build records User Timing marks for every page render, engine
recompute and committed write, and sends each one to the Rust `perf_report` command, which
prints it to stderr. The line is only visible when the binary is started from Terminal, so in
everyday use the app does this work for nobody. Option A in #453 (timing in development
builds only) would have lost the release-build cold-start measurement that ADR 0066 requires,
so the owner chose a flag instead.

## Decision

**0233. The release build measures timings only when asked.** Amends 0066 (how the budgets are measured; the budgets stay).

1. In the release build, timing is off by default: no marks are recorded and nothing is sent to the Rust side.
2. It is on when the app is started from Terminal with `RTRACKER_PERF=1` (running the binary inside the .app directly, the only way to see its error output). Rust reads the variable once at start; the frontend asks once and installs the timing sink only then. Output is as today.
3. Development builds (`pnpm tauri dev`) always measure, as today.
4. `docs/release.md` gives the exact Terminal command and says the ADR 0066 budgets are checked with it before a release.
5. Tests: with the flag off nothing is measured or sent; with it on, today's lines are printed (written failing first). The release bundle still contains the command, called only when enabled. No figure changes.

The acceptance box "release bundle contains no call to `perf_report`" is replaced by: no call happens unless the flag is set.

## Implementation notes

- Only the exact value `1` turns timing on; `0`, an empty value or `true` leave it off.
- Rust also ignores a `perf_report` call while timing is off, so a stray call prints nothing.
- The frontend asks the new `perf_enabled` command once, before the first render (in the
  `Promise.all` that already waits for the dictionary and the fonts). If the call fails,
  timing stays off.
- Like the fonts (ADR 0192), the question gives up after 1000 ms so a hung call cannot keep
  the window blank; no answer in time means off, and a late answer is ignored.
- In a plain browser (`pnpm dev`, E2E, ux:capture) a development build keeps its marks,
  visible in the browser's performance tools, with no sink; a production browser build
  records nothing.

## Consequences

- No figure, parity target, golden-master, schema or UI change.
- Everyday release launches (from the Finder or the Dock) record no timings.
- The release checklist gains a timing step (`docs/release.md`).
