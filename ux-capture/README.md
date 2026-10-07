# UX capture

Screenshots of every screen and state, plus an axe WCAG 2.2 AA scan of each one. Use it
for UX reviews and for before/after evidence of UI changes. CI runs it too (job `axe`:
English, light + dark, 1280×800 + `min`) and fails on any axe violation (F-08, ADR 0078).

```bash
pnpm ux:capture                                  # en, light, 1280×800
UX_LANG=all UX_THEME=both pnpm ux:capture        # every language × light/dark
UX_VIEWPORT=min pnpm ux:capture                  # Tauri minimum window (900×600)
pnpm ux:capture --grep "20-property"             # only matching screens
```

`pnpm ux:readme` takes the README screenshots (dashboard, property detail, projections,
scenarios; light + dark, 1440×900 at 2×) into `docs/screenshots/` (`readme.spec.ts`).

The run boots its own Vite server on port 1430 (`UX_PORT`) with `VITE_E2E=1`. The app
then runs on the in-memory sql.js seed, the synthetic sample portfolio. **No real
database is opened**, and a running `pnpm tauri dev` on port 1420 is never reused.

## Output (git-ignored)

```text
ux-screens/<date>-<sha>[-dirty]/
  summary.md                         # axe violations per screen and per rule
  <lang>-<theme>-<viewport>/
    <nn>-<screen>.png                # full page unless the entry says otherwise
    axe/<nn>-<screen>.json           # violations with targets and failure summaries
    90-keyboard-focus-order.json     # Tab sequence from page load
```

Set `UX_RUN_ID=<name>` to write several variant runs into one folder (one shared
`summary.md`).

## Comparing two runs

```bash
pnpm ux:diff <runA> <runB>     # e.g. p07c-before p07c-after (folders under ux-screens/)
```

A pixel counts as changed when its red, green or blue moves by more than
`UX_DIFF_TOLERANCE` levels (default `8`). A screen fails when more than `UX_DIFF_MAX_PX`
pixels changed (default `50`). Screens found in only one run are listed as `MISSING` (run A
only) or `NEW` (run B only) and fail too. The diff exits non-zero on any failure and always
prints the largest change.

Two runs of the same commit are not always bit-identical: Chromium anti-aliasing moves a
few channel levels on charts, tooltips and focus rings. Measured on 2026-10-07 (en, light
and dark, 1280x800 and min, 280 screens): with tolerance 0, up to 150 px on a screen; with
the default tolerance 8, at most 14 px. One changed KPI digit is about 300 px, so the
defaults catch it (#137). Use `UX_DIFF_TOLERANCE=0 UX_DIFF_MAX_PX=0` for an exact
comparison. PNG hashes cannot prove a no-op (DR-147). The capture emulates "Reduce motion" (charts skip their entry animation),
turns CSS transitions off (DR-160) and waits until animations stop and the charts' SVG is
stable before each shot.

## Axe gate

```bash
pnpm ux:axe-check <run>        # lists every violation; exit 1 if any (what CI runs)
```

## Variables

| Variable      | Values                                     | Default                |
| ------------- | ------------------------------------------ | ---------------------- |
| `UX_LANG`     | `en`, `cs`, `ru`, comma list, `all`        | `en`                   |
| `UX_THEME`    | `light`, `dark`, `both`                    | `light`                |
| `UX_VIEWPORT` | `1280x800`, `min`, any `WxH`, comma list   | `1280x800`             |
| `UX_DATE`     | ISO timestamp for the frozen browser clock | `2026-10-01T10:00:00Z` |
| `UX_RUN_ID`   | output folder name                         | `<date>-<sha>`         |

The clock is frozen, so "Today" and the as-of presets stay the same between runs and the
before/after screenshots can be compared.

## Adding a screen

Add an entry to `SCREENS` in `screens.ts`. The `run` function drives the app through the
UI and calls `ux.capture("<id>")`. Take button names from the dictionaries (`ux.t.…`) so the
entry works in every language. When a new `Route` is added to `src/state/uiStore.ts`,
typecheck fails at `ROUTE_COVERAGE` until a screen covers it.
