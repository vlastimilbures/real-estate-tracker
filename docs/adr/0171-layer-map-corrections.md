# 0171. Layer map corrections: import uses the engine, i18n takes engine types only

- Status: Accepted
- Date: 2026-10-10
- Source: issue #154 (2026-10 code review, findings R6-09, R6-19, option A); owner decision
  (2026-10-10, Track 13 PR 13.2: fix the rule drift, keep the baseline machinery)
- Amends: [0072](0072-layer-map-platform-and-type-edges.md) (layer-map rows Data, Import,
  UI model and i18n; the Consequences sentence on the state facades)

## Context

The ADR 0072 layer map and `.dependency-cruiser.cjs` had drifted apart:

- The table says Data may use "engine types, lib (not today/format)". The data mappers and
  repositories also call the engine's boundary constructors at runtime (`money`, `rate`,
  `mortgageBlock`, the date helpers; `src/data/mappers.ts`), which the ESLint data block
  allows by name. `lib/today` no longer exists; `data-no-ui-lib` bans `lib/day.ts` and
  `lib/format.ts`.
- The table says Import may use "data, lib". `src/import/csv.ts` (`instalmentFor`) and
  `src/import/inputRules.ts` (`validateInputs`) import the engine at runtime, and no rule
  limited `src/import` beyond state, ui and react.
- The table says i18n uses "engine types". The `i18n-leaf` rule allowed runtime engine code
  and `src/platform`.
- The table says UI model uses "engine, lib, i18n". `ui-model-pure` bans react, Tauri and the
  runtime state, data and import layers, and allows other npm packages:
  `src/ui/model/xlsxExport.ts` uses `exceljs`.
- The Consequences say the state facades "keep the UI testable without the data layer". UI
  tests mock the data and platform modules directly (for example
  `src/ui/components/__tests__/ErrorBoundary.test.tsx`), so that claim is not true.

The review also challenged the facades themselves, since they only re-export. Their real
value holds: they are one greppable list of what the UI may touch, and with `ui-no-data` they
stop the UI from calling repository writes, `tauriSql` or Tauri `invoke` directly, which
protects the store's write path.

## Decision

1. **Data may use engine types and the engine's boundary constructors** (dates, `money`,
   `rate`, `mortgageBlock`), lib except `day` and `format`, platform and Tauri, as the
   rules already enforce.
2. **Import may use data, engine, lib and `papaparse`.** The `import-layer` rule (was
   `import-no-upper-layers`) bans state, ui, platform, i18n, react and Tauri.
3. **i18n takes only types from the engine.** `i18n-leaf` bans every `src` layer except i18n
   and the engine; the new `i18n-engine-types-only` rule keeps the engine edge type-only.
4. **UI model may use npm packages other than react and Tauri** (today `exceljs`), as
   `ui-model-pure` already allows.
5. **The state facades stay.** Their stated benefit is the single list of UI entry points
   and the protected write path, not testability.
6. The known-violations baseline and `pnpm depcruise:baseline-check` stay (CLAUDE.md §4).

Layer map rows after this ADR (the other rows of ADR 0072 are unchanged):

| Layer    | Path           | May import (runtime)                                                          |
| -------- | -------------- | ----------------------------------------------------------------------------- |
| Data     | `src/data`     | engine types and boundary constructors, lib (not day/format), platform, Tauri |
| Import   | `src/import`   | data, engine, lib, `papaparse`                                                |
| UI model | `src/ui/model` | engine, lib, i18n, npm packages except react and Tauri                        |
| i18n     | `src/i18n`     | engine types                                                                  |

## Consequences

The Data, Import, UI model and i18n rows now match their rules, so a new import from i18n into the engine's code or from
import into platform fails `pnpm depcruise`. Today's code needed no change. No behaviour
changes.
