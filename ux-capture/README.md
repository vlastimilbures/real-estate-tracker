# UX capture

Screenshots of every screen and state, plus an axe WCAG 2.2 AA scan of each one. Use it
for UX reviews and for before/after evidence of UI changes. CI runs it too (job `axe`:
English, light + dark, 1280×800 + `min`; plus the layout screens in Czech and Russian, light,
1280×800 + `min`, ADR 0158) and fails on any axe violation or layout assertion (F-08,
ADR 0078). On CI a failed screen is retried once; see [Retries and flaky
captures](#retries-and-flaky-captures).

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
    axe-expected/<nn>-<screen>       # one per capture that owes a scan (ux:axe-check)
    axe-skipped.json                 # instead of axe/, in a run with UX_AXE=0
    90-keyboard-focus-order.json     # Tab sequence from page load
  flaky.json                         # only when a screen passed on its retry
```

Set `UX_RUN_ID=<name>` to write several variant runs into one folder (one shared
`summary.md`).

## Comparing two runs

```bash
pnpm ux:diff <runA> <runB>     # e.g. p07c-before p07c-after (folders under ux-screens/)
pnpm ux:diff /abs/path <runB>  # either side may be an absolute folder (a cached baseline)
```

A pixel counts as changed when its red, green or blue moves by more than
`UX_DIFF_TOLERANCE` levels (default `8`). A screen fails when more than `UX_DIFF_MAX_PX`
pixels changed (default `50`). Screens found in only one run are listed as `MISSING` (run A
only) or `NEW` (run B only) and fail too. The diff exits non-zero on any failure and always
prints the largest change.

Two runs of the same commit are not always bit-identical: Chromium anti-aliasing moves a
few channel levels on charts, tooltips and focus rings. Measured on 2026-10-07 (en, light
and dark, 1280x800 and min, 280 screens): with tolerance 0, up to 150 px on a screen; with
the default tolerance 8, at most 14 px. One changed KPI digit (a 21×30 px box) is about
300 changed px, so the defaults catch it (#137). For an exact comparison, set both
variables to `0`. A bad value stops the diff with exit 2.

No screen is known to flake at the default tolerance (#536), so a screen that differs
from the base is a change to explain. Measured on 2026-11-24 (en, light, 1280x800, 101
screens, two runs of one commit): 0 px differ at the default tolerance; at tolerance 0,
the 90-keyboard-focus tab shots differ by 1 or 2 levels (tab20 up to 111 px, in the
Nominal/Real toggle under the blurred topbar; tab12 41 px; tab8 2 px), which the default
tolerance ignores. Measured at en/light/1280x800; at `min`, only the #536 screens were run
twice.

A click that scrolls the window right before a shot can flake the shot: a sticky element
(the sidebar, a table's pinned column) rests at a fractional offset at the scrolled
position, and once the pointer is parked Chromium redraws it a while later, so the shot
catches its text or borders 1 px off, in part or not at all. The DOM layout is the same in
every variant (#536: 22-property-mortgage-add-errors; 64b-settings-backup-refused and
82-load-sample-loaded at `min`). Such a scene clicks with `clickInPlace()` (helpers.ts),
which neither scrolls nor moves the pointer.

PNG hashes cannot prove a no-op (DR-147). The capture emulates "Reduce motion" (charts
skip their entry animation), turns CSS transitions off (DR-160), parks the mouse pointer
at the window's top-left corner (the sidebar's padding, where nothing reacts to a hover)
and waits until animations stop and the charts' SVG is stable before each shot. A scene
that hovers or focuses on purpose for a tooltip passes `keepPointer: true` to
`ux.capture()` / `ux.shot()`; the shot fails if anything interactive ever sits under the
parking point (#536).

## Proving a UI change

A PR's before/after proof compares its branch with a cached capture of the commit it
branched from, so each main commit is captured once for everyone, not once per PR:

```bash
git fetch origin
BASE=$(pnpm -s ux:baseline "$(git merge-base HEAD origin/main)")  # the branch's base
UX_AXE=0 UX_RUN_ID=my-branch pnpm ux:capture  # the branch, once, without the axe scan
pnpm ux:diff "$BASE" my-branch                # every changed screen is listed
UX_AXE=0 UX_RUN_ID=my-branch pnpm ux:capture --grep "<id>|<id>"
                                              # re-capture only the screens that differed
                                              # (overwrites them in the run), then diff again
```

Diff against the branch's base, not a newer origin/main, or main's own changes show up as
yours (or rebase onto origin/main first and use `pnpm -s ux:baseline`). The branch capture
must use the same `UX_LANG`, `UX_THEME` and `UX_VIEWPORT` as the baseline: set them once
for both commands, or a screen missing from one side is listed as `MISSING`/`NEW`.

`pnpm ux:baseline [ref]` (default `origin/main`) resolves the ref to its full sha and keeps
one run per sha and matrix (`UX_LANG`, `UX_THEME`, `UX_VIEWPORT`, in any spelling) in
`$UX_BASELINE_CACHE` (default `~/Library/Caches/rtracker-ux`), as
`<sha>/<lang>_<theme>_<viewport>` with a `complete.json` marker written last. On a miss it
checks the commit out into a temporary worktree, installs it (offline first), captures it
with `UX_AXE=0` on a free port, moves the run into place and removes the worktree; a lock
folder (`<key>.lock/pid`) makes a second caller wait for the first one's run instead of
capturing again. A lock is stale when its process is gone, or when it is older than 2 hours;
Ctrl-C or SIGTERM removes the lock, the unfinished run and the worktree. `UX_WORKERS=<n>`
caps the capture's Playwright workers. `pnpm ux:baseline --prune` deletes finished runs
(with a valid `complete.json`) whose sha origin/main no longer reaches or that are older
than 14 days (never origin/main's own), unfinished `.tmp-<pid>` runs and dead locks. It
only looks inside full-sha folders, never follows a symbolic link, and deletes nothing it
did not create.

`UX_AXE=0` skips the axe scan, about a quarter of each screen's time. Such a run says so in
`summary.md`, leaves an `axe-skipped.json` in each variant folder, and `pnpm ux:axe-check`
fails on it (exit 2) rather than passing with nothing checked. Each `ux.capture()` that
owes a scan also leaves `axe-expected/<id>`, and the check fails while any of those has no
`axe/<id>.json`, so a scanning `--grep` re-capture into such a run cannot pass for the
whole run. CI never sets it: the `axe`
job still scans every screen, so a proof captured without the scan still gets one on its
PR.

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
| `UX_OUT`      | absolute output folder (wins over the id)  | `ux-screens/<run id>`  |
| `UX_RETRIES`  | retries of a failed screen                 | `1` on CI, else `0`    |
| `UX_AXE`      | `0` skips the axe scan, `1` runs it        | `1`                    |
| `UX_PORT`     | the run's Vite port                        | `1430`                 |

The clock is frozen, so "Today" and the as-of presets stay the same between runs and the
before/after screenshots can be compared.

## Layout

```text
capture.spec.ts        one test per screen, the route, unique-id and layout-tag guards
helpers.ts             the `ux` fixture (capture, shot, axe), boot, nav, panel, settings tab
matrix.ts              the lang × theme × viewport matrix and its cache key
baseline.ts            `pnpm ux:baseline`: the shared capture of main (baselineCache.ts: paths, marker)
runPath.ts             where ux:diff and ux:axe-check find a run (name or absolute path)
flows.ts               app-driving helpers: edited backups, startup faults, loan events, forms
layout/                the layout assertions (common, dashboard, pages)
layoutScreens.ts       the screens CI also captures in Czech and Russian (`@layout-i18n`)
flakeReport.ts         reporter: regressions vs flaky captures
screens/define.ts      defineScreen(id, desc, run)
screens/<area>.ts      the screens of one area, in flow order
screens/index.ts       SCREENS (the areas in flow order) and ROUTE_COVERAGE
```

No `.ts` file here may pass 600 lines (`__tests__/fileSize.test.ts`); split an area that
outgrows it into two contiguous files and add both to `screens/index.ts` in flow order.

## Adding a screen

Add a `defineScreen("<id>", "<what it shows>", async (ux) => { … })` entry to its area's
file under `screens/`, in flow order. The `run` function drives the app through the UI and
calls `ux.capture()`, which saves the PNG and axe scan under the screen's id; an extra
state of the same screen passes its own id (`ux.capture("<id>-open")`). Take button names
from the dictionaries (`ux.t.…`) so the entry works in every language. When a new `Route`
is added to `src/state/uiStore.ts`, typecheck fails at `ROUTE_COVERAGE`
(`screens/index.ts`) until a screen covers it.

## Czech and Russian layout screens

CI also captures the screens listed in `layoutScreens.ts` in Czech and Russian
(`pnpm ux:capture --grep @layout-i18n`, light, 1280×800, 1200×800 and `min`). Their tests
carry the `@layout-i18n` tag. A listed id without a screen, or listed twice, stops the run
when the manifest loads, so renaming a layout screen fails the step instead of dropping the
screen from it. To add one, add its id to the list.

## Retries and flaky captures

`UX_RETRIES` sets how often a failed screen is retried: once on CI, never locally. The
reporter (`flakeReport.ts`) then sorts the failures:

- **Regression**: the screen failed every attempt. The run fails.
- **Flaky**: the screen failed, then passed on its retry. The run stays green; CI shows a
  `Flaky capture` warning per screen, a table in the job summary, and writes `flaky.json`
  to the run folder, which makes CI upload the evidence as on a failure.

A flaky screen is still a bug in the screen or the app: fix it rather than leave it.
