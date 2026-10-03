# 0083. Coverage floors re-baselined for Vitest 4

- Status: Accepted
- Date: 2026-10-03
- Amends: the per-folder coverage ratchet in `vite.config.ts`

## Context

Dependabot reported critical and high advisories in the dev toolchain (vitest < 4.1.11,
@vitest/mocker, vite ≤ 6.4.2). Clearing them needs Vitest 4. Vitest 4's v8 provider maps
coverage through the source AST: JSX `&&`, `??` and ternaries now count as branches, and lines
are counted as statements. With the same 1502 tests, the measured total went from 91.9 %
branches (3362) to 79.2 % (2692), and six per-folder floors failed. No test was removed and no
code lost coverage; the measurement changed.

## Decision

Owner, 2026-10-03: upgrade to Vitest 4 and re-baseline the failing floors once to the new
measured value, floored (the ratchet's own rule). Floors that still pass stay as they were.

| Folder                 | Lines   | Branches |
| ---------------------- | ------- | -------- |
| `src/state/**`         | 84      | 82 → 78  |
| `src/platform/**`      | 79 → 65 | 81 → 50  |
| `src/ui/pages/**`      | 66 → 57 | 66 → 43  |
| `src/ui/components/**` | 73 → 72 | 85 → 67  |
| `src/ui/hooks/**`      | 97 → 96 | 86 → 84  |
| `src/ui/*.{ts,tsx}`    | 60      | 79 → 64  |

## Consequences

Not user-visible. The ratchet continues upward from these values; they are never lowered
again for a reason other than a change in how coverage is measured.
