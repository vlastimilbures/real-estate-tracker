# 0101. Scenarios: keep the compare state for the session; crash timing is a setting

- Status: Accepted
- Date: 2026-10-03
- Source: issues #50 and #51 (Scenarios critical review after #15)

## Context

The compare selection, the Base toggle and the price-crash timing were local React state on
the Scenarios page. They reset whenever the user left the page, for example to check a
mortgage, and had to be set again. Ids of deleted scenarios stayed in the selection.

The crash timing (Start / +5y / +10y) was a row of primary/ghost buttons beside the level
buttons (−10 / −20 / −35 %). It read as an action, not a setting, and the level buttons did
not show which timing they would use.

## Decision

1. The compare selection (saved-scenario ids, at most 3), the Base toggle and the crash timing
   live in the UI store. They last for the app session, like the Nominal/Real lens, and are
   not persisted across restarts. Defaults: nothing ticked, Base on, timing Start.
2. When the scenario list changes (delete, backup restore, CSV import, clearing the sample),
   ids that no longer exist leave the selection. The order of the rest is kept.
3. The crash timing is a segmented toggle with the visible label "When". It changes no data,
   so it stays usable while a save is running.
4. A level button shows its timing when it is not Start: "−20% @ +5y". At Start it shows
   "−20%". Its tooltip is the preset name; at Start the tooltip also names the projection
   start date.
5. Preset names do not change ("Price crash −20% @ +5y"), so an already saved preset is still
   found by name and not added twice (ADR 0093).

## Consequences

Display and navigation only: no computed number, parity target, golden master or engine
output changes. New "When" string in en, cs and ru; the "Apply the crash at …" tooltip is
removed. The compare tick logic moves from `src/ui/model` to `src/state`, because the store
may not import UI modules.
