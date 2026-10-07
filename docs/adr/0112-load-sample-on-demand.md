# 0112. Load the sample portfolio on demand

- Status: Accepted
- Date: 2026-10-03
- Source: issue #74; follows ADR 0094 (Consequences: "reseed on demand"); builds on ADR 0016,
  ADR 0014 and ADR 0110
- Amends: [0016](0016-first-run-seed.md) (an empty portfolio can load the sample on demand)

## Context

The first run seeds a fictional sample portfolio of three apartments (ADR 0016), and ADR 0094
lets the user clear it in one step. Nothing brings it back. A user who cleared the sample, or
who installed before the sample was marked, may want it again to explore the app. Adding the
sample next to real properties would mix fictional and real figures in every total and KPI.

## Decision

1. **Only on an empty portfolio.** Settings → Backup shows a **Sample portfolio** panel with
   **Load sample portfolio** only while the portfolio has no properties. The existing panel with
   **Clear sample** (ADR 0094) still shows while the sample is active. There is no other entry
   point.
2. **One transaction (ADR 0014).** Loading inserts the three sample properties (`javorova`,
   `lipova`, `dubova`) with the same mortgages, valuations, leases and holding costs as the
   first-run seed, sets `app_meta.sample_active`, and removes `app_meta.sample_banner_dismissed`
   so the sample banner shows again. `sample_seeded` is not touched. A failure leaves nothing
   behind.
3. **Never overwrite or merge.** The data layer counts the properties first and refuses with a
   typed error when any exists, writing nothing. As nothing is replaced or deleted, no safety
   backup is written.
4. **Assumptions and scenarios are kept.** The sample is projected with the user's current
   assumptions, so its figures can differ from the first-run figures and the parity targets.
5. **A data write.** Loading sets `app_meta.changed_since_backup` (ADR 0110).
6. A confirmation message says the sample was loaded and can be cleared from Settings or the
   banner. A refusal or failure shows in the page's error panel. All new text is translated in
   en, cs and ru.

## Consequences

User-visible change under ADR 0001; no computed number, parity target, engine output, schema
version, backup format or migration changes. Restoring a backup taken while the sample was
loaded brings the sample properties back without the marker, as in ADR 0094.
