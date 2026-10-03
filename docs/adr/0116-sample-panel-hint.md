# 0116. Sample panel hint does not say how the sample arrived

- Status: Accepted
- Date: 2026-10-03
- Source: issue #97 (found after ADR 0112, #74)

## Context

Settings → Backup shows a **Sample portfolio** panel with a **Clear sample** button while
the sample is active (ADR 0094). Its hint said "Fictional apartments added on first launch".
Since ADR 0112 the user can load the sample again later with **Load sample portfolio**. Then
the sample was not added on first launch, and the hint is wrong.

## Decision

1. The Clear panel uses the same hint as the Load panel:
   - en: `Fictional apartments to explore the app`
   - cs: `Fiktivní byty pro vyzkoušení aplikace`
   - ru: `Вымышленные квартиры, чтобы опробовать приложение`
2. One hint serves both panels because they never show together. Load needs an empty
   portfolio and no active sample; Clear needs an active sample.
3. The `sample.panelHint` key is removed from all three dictionaries. The `loadHint` key
   keeps its name.
4. A test checks that the Clear panel shows this hint and no "first launch" text.

Rejected: storing how the sample arrived (first-run seed or a later load) and showing two
wordings. That adds saved state for a one-line hint.

## Consequences

User-visible wording change under ADR 0001; no computed number, parity target, engine
output, schema or backup format changes.
