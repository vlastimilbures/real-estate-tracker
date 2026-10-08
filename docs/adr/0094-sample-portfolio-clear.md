# 0094. Label the sample portfolio and clear it in one step

- Status: Accepted
- Date: 2026-10-03
- Source: issue #18 (pre-release review 2026-10, finding A13); builds on ADR 0016 and ADR 0052
- Amended by: [0127](0127-opaque-property-ids-sample-match.md) (§3, §5: the sample is matched by
  id and seeded name; a restore clears the sample markers),
  [0154](0154-one-outcome-path.md) (the "sample cleared" notice shows on every page and is
  cleared when the data is replaced)

## Context

On the first run the app seeds a fictional sample portfolio of three apartments (ADR 0016), but
nothing in the UI says the data is a sample. A new user cannot tell whether the flats are demo
data, and the only way to start their own portfolio is to delete the sample properties one by
one. The empty Properties page also offers fewer actions than the empty Dashboard: it only
describes the buttons in its text.

## Decision

1. **Marker.** The first-run seed writes `app_meta.sample_active = '1'` in the same transaction
   as the sample rows. `sample_seeded` stays as it is and is never removed, so clearing the sample
   never causes a reseed. Editing a sample property does not clear the marker.
2. **Existing installs.** An install seeded before this change has no marker and shows no banner.
   The app does not guess from property names, to avoid labelling real data as a sample.
3. **Banner.** While the sample is active, Dashboard and Properties show an information banner:
   "You're looking at a sample portfolio with fictional apartments." with the actions **Clear
   sample and start my own** and **Keep exploring**. "Keep exploring" hides the banner for good
   (`app_meta.sample_banner_dismissed`). The sample counts as active only while the marker is set
   and at least one sample property (`javorova`, `lipova`, `dubova`) still exists, so a user who
   deletes all three by hand no longer sees the banner.
4. **Settings.** While the sample is active, Settings → Backup shows a **Sample portfolio** panel
   with the same clear action, whether or not the banner was dismissed.
5. **Clear sample.** A confirmation dialog states what is deleted and what is kept. On confirm the
   app:
   1. writes and verifies a safety backup, as Restore does (ADR 0052), named
      `portfolio-before-clear-sample-<UTC stamp>.json`; if this fails, nothing is deleted;
   2. in one transaction (ADR 0014), deletes the three sample properties with every record under
      them, including records the user added to a sample property, and removes both markers;
   3. opens the Dashboard and names the safety backup in a confirmation message.

   Properties the user added are never deleted. Assumptions are kept unchanged. Saved scenarios
   are kept; per-property overrides for a deleted property are ignored, as after any property
   delete.

6. **Empty states.** The empty Properties page gets the same two actions as the empty Dashboard:
   **Add property** and **Import CSV**. The empty Dashboard also shows a static **Getting started**
   list: set assumptions, add a property, add its mortgage, lease and costs, review, export a
   backup. Each step links to its page; there is no wizard.
7. All new text is translated in en, cs and ru.

## Consequences

User-visible change under ADR 0001; no computed number, parity target or engine output changes.
Restoring the pre-clear safety backup brings the sample properties back without the marker, so
they show as ordinary data with no banner. Reseeding the sample on demand is a possible later
feature and is not part of this decision.
