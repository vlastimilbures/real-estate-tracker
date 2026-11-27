# 0223. Data check: counts in the head, two blocks of rows, last on both pages

- Status: Accepted
- Superseded in part by: [0274](0274-sections-current-rule.md) (decision 5)
- Date: 2026-11-16
- Source: issue #422 (UX/UI review 2026-11, round 2, tracking #425); direction approved
  by the owner on 2026-11-16 (points 4 and 5 of the round-2 plan); acceptance delegated
  by the owner for the 2026-11-16 run
- Amends: [0118](0118-data-check.md) (Property detail's Data check: its place, its look
  and the title pill), [0206](0206-data-check-grouped.md) §2–§4 (the summary row and the
  line layout), [0107](0107-property-section-nav.md) (the section order)
- Related: [0217](0217-info-tip.md) (the as-of note behind the info icon),
  [0218](0218-dashboard-pill-and-chart-grid.md) §1 (the title pill, now on Property detail
  too)

## Context

The Dashboard's Data check put its two counts in a summary row in the body and its as-of
note on the title's line. Its findings were two lists, one after the other. Property
detail's Data check was a different component: two sub-headed lists with a "Go to …"
button per finding, a count sentence in the head and the as-of note at the bottom. It
was also the second section of the page, ahead of the data it points at.

## Decision

1. **Counts under the title.** The counts show as two pills on their own line directly
   under the panel head, visible while the panel is collapsed too (on the title's line
   they do not fit in Russian at 1280 px, and panel heads stay one line, ADR 0214):
   amber "N need attention" (`dataCheck.needAttention`, warning icon, the app's warning
   look: sand ground, warn ink), or a green check
   with `dataCheck.attentionNone` when nothing does; and neutral "N use portfolio
   defaults" (`dataCheck.useDefaults`, info icon) when any finding uses defaults. The
   as-of note (`dataCheck.asOfNote`) moves to the info icon, after the title. The Dashboard's Show/Hide
   stays in the head (ADR 0206, 0203).
2. **Two blocks.** The body holds a "Needs attention" block (amber-tinted head) and a
   "Using portfolio defaults" block (neutral head), each a `h3` over a list it names.
   When both are present they sit side by side on a container of 880 px or more and stack
   below; a block with no findings is not shown.
3. **Rows.** Each finding is a hairline-separated row: its icon, the problem, then its
   action right-aligned (under the problem in a block narrower than 680 px). On the Dashboard
   the action is one chip per property (ADR 0206 §4, unchanged); on Property detail it is
   the "Go to …" link, still described by its row (#133). One `DataCheckBlock` and
   `DataCheckRow` serve both pages.
4. **All clear.** With no findings at all, the panel is the title and one quiet line, a
   green check and `dataCheck.attentionNone`: no pills, no toggle, no blocks. The as-of
   note stays behind the info icon.
5. **Property detail.** The Data check is the **last** section, after Amortization (the
   section nav and Tab order follow), and the title shows the same amber pill as the
   Dashboard when something needs attention; the pill moves focus to the Data check
   heading. A deactivated property still has no Data check (ADR 0155).
6. **Dictionary:** `dataCheck.summary` (Property detail's count sentence) is removed; the
   pills say the same with the existing `needAttention` and `useDefaults`.

## Consequences

- One look and one place for the Data check on both pages; the counts read before the
  details, and the panel is quiet when there is nothing to do.
- No computed number, finding, stored data or export changes.
- The ux capture checks the head pills, the blocks side by side or stacked, the rows'
  actions on the right, and Property detail's section order and pill.
