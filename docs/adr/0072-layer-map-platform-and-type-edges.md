# 0072. Layer map: platform layer, state facades, type-only edges, baseline check

- Status: Accepted
- Date: 2026-10-02
- Source IDs: DR-163, DR-164, DR-165, DR-166, DR-167 (P11 follow-up F-03, D-71)
- Amended by: [0171](0171-layer-map-corrections.md) (rows Data, Import, UI model and i18n; the
  facades' benefit is the list of UI entry points, not testability)

## Context

P10 froze 26 layer violations in `.dependency-cruiser-known-violations.json` (ADR 0068). The
P11 review scored Architecture "Meets" with those as the gap, and noted that "the baseline only
shrinks" was a review convention, not a tool check. The violations fall into four groups:

- the UI imports the data and import layers (error log, error classes, backup, CSV parsing)
  and Tauri directly;
- `ui/model` and `state` import _types_ from layers they may not import at runtime;
- `src/lib` wraps Tauri commands (`saveFile`, `perfReport`), although lib is the pure bottom
  layer;
- `data/backup.ts` reads the clock and saves files through lib helpers.

## Decision

Owner, 2026-10-02 (P12 plan):

1. **Type-only edges are allowed** by the state and UI layer rules (`state-no-ui`,
   `ui-model-pure`, `ui-no-data`). Types are erased at compile time, so an `import type` edge
   adds no runtime coupling (the same reasoning as the type-only cycle rule, ADR 0068 / D-69).
   Runtime edges stay forbidden. The engine, lib, data, import and i18n rules stay strict: no
   DB or UI types leak into the lower layers (CLAUDE.md §4).
2. **New `src/platform` layer** for Tauri command wrappers (`saveFile`, `perfReport`, menu
   events). It may import `src/lib` and `@tauri-apps`; data and state may import it; the UI may
   not. `src/lib` stays free of Tauri.
3. **The UI reaches data, import and platform only through state.** Thin facade modules in
   `src/state` re-export or wrap what pages and components need (error logging, backup, CSV
   parsing, file saving, menu events). Facades add no logic.
4. **Data gets the date and the save function injected** by the store action instead of
   importing `lib/today` and the file-save helper.
5. **A CI check fails a pull request whose baseline gains an entry**
   (`pnpm depcruise:baseline-check` compares against the base branch).

Layer map after this ADR:

| Layer    | Path             | May import (runtime)                                  |
| -------- | ---------------- | ----------------------------------------------------- |
| Engine   | `src/engine`     | `decimal.js`, `src/lib/money.ts`                      |
| Lib      | `src/lib`        | `decimal.js`                                          |
| Platform | `src/platform`   | lib, `@tauri-apps`                                    |
| Data     | `src/data`       | engine types, lib (not today/format), platform, Tauri |
| Import   | `src/import`     | data, lib                                             |
| State    | `src/state`      | data, import, engine, lib, platform, i18n             |
| UI model | `src/ui/model`   | engine, lib, i18n                                     |
| UI       | `src/ui` (other) | state, ui/model, engine, i18n, lib                    |
| i18n     | `src/i18n`       | engine types                                          |

State, UI model and UI may also import _types_ from any layer, as long as no runtime cycle
results.

## Consequences

The baseline is empty after P12; any new violation fails `pnpm depcruise`, and a regenerated
baseline that grows fails `pnpm depcruise:baseline-check` in CI. Facade modules are one more
hop for the UI, which keeps the UI testable without the data layer. No behaviour changes.
