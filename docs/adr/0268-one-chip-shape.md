# 0268. One chip shape; the findings count looks the same in the title and in the Data check

- Status: Accepted
- Date: 2026-11-26
- Source: issue #495, part 6 (code review 2026-11, CR-61, R11-08, tracking #435). The owner
  decided on 2026-11-26 to have one ADR per part, with before/after captures and approval
  before merge. Draft in #495 comment 7180114864 (prototype PR #617), approved by the owner
  on #495 on 2026-11-26 (comment 7180285750): the amber border on the warn count is
  accepted (open question 1), with the dark-theme contrast checked at 8.2:1 (open
  question 2). In the same comment the owner closed the breakpoints question: they stay
  documented only (the table at the top of `layout.css`), with no merge ADR.
- Related: [0218](0218-dashboard-pill-and-chart-grid.md) §1 (the title's review pill),
  [0118](0118-data-check.md) (the Data check), [0157](0157-accessibility-batch.md) (the warn
  colours), [0266](0266-one-text-button-class.md) and [0267](0267-one-banner-box.md)
  (parts 4 and 5)

## Context

Line references are to main @ 1d72fd34.

The issue lists four pill classes. They are not all one thing:

- `.pill` (`controls.css:123-143`) is a **toggle**: segmented controls and the property
  filter. It has an on state and a shadow. It is a control, not a label.
- `.title-pill` (`shell.css:431-455`): the **review pill** after the page title, "⚠ 2"
  (`PageFrame.tsx:65`, ADR 0218 §1). A button, 13 px, 24 px tall, warn colours, **warn
  border**.
- `.dc-pill` (`data-check.css:14-39`): the Data check's **counts**, "⚠ 2 need attention",
  "6 use portfolio defaults" (`DataCheckBlocks.tsx:64-78`). Static, 12 px. In the warn tone
  it has warn colours but a **hairline border**.
- `.dc-chip` (`data-check.css:138-160`): the Data check's **fix links**, the property names
  (`DashboardDataCheck.tsx:65`). Buttons, 13 px, 24 px tall, surface colours.

The last three share one shape: inline-flex, centred, `--s1` gap, a 1 px border and a pill
radius. Each repeats it. The title pill and the warn count say the same thing ("N findings
need attention") in the same colours, but one has an amber border and the other does not.
On the Dashboard both show at once, about 400 px apart, so the difference is easy to see.

## Decision

1. **A `.chip` base** (`shell.css`) holds the shared shape: inline-flex, centred, `--s1`
   gap, `1px solid var(--hairline)`, pill radius. `.title-pill`, `.dc-pill` and `.dc-chip`
   add `chip` in their markup, and each keeps only its own size, padding, font and colours.
2. **A `.chip.warn` tone** is the one look for "findings to review": chip-bg ground, warn
   ink, **warn border**, weight 600. The title pill and the Data check's warn count both
   use it. `.dc-pill.warn` is deleted.
3. **Sizes stay as they are.** The title pill stays 13 px and 24 px tall, because it is a
   button and needs the WCAG 2.5.8 target. The count stays 12 px and static.
4. **`.pill` stays separate**, because it is a toggle.

## Visible effects

- **One visible change:** the Data check's "N need attention" count gets the amber (warn)
  border the title pill has. Before, its border was the hairline grey.
  - This shows on the Dashboard and on Property detail whenever a finding needs attention.
  - The text, colours, size and position do not change.
- Nothing else moves: the counts that are not warn, the fix links, the title pill
  (including its hover and focus) and the toggles.
- Dark theme: `--warn` is defined there too, so the border follows it. The prototype's dark
  capture of the five changed screens showed the same single box per screen, with the
  border at `#d9b873` (`--warn`); the owner checked its dark contrast at 8.2:1.
- No change to the text in the language files, to computed numbers or to stored data.

## Customer view

- **Would a user notice?** Only someone who looks closely: the warn count's border goes
  from grey to amber.
- **Is it clearer?** Yes, a little. The title pill and the count now look like the same
  thing, and they are. A user who sees "⚠ 2" by the title and then "⚠ 2 need attention" in
  the Data check can tell at a glance that it is the same signal. The amber border also
  sets the warn count apart from the neutral "use portfolio defaults" count beside it,
  which today differs only by its sand fill.
- **What was chosen not to do:** make the count exactly as large as the title pill. One is
  a button and the other a label, and the same size would make the label look clickable.

## Tests

Written first and failing on main:

- A CSS test: `.chip` holds the shape; `.title-pill`, `.dc-pill` and `.dc-chip` do not
  repeat it; `.chip.warn` sets `border-color: var(--warn)`; no `.dc-pill.warn` rule is left.
- Markup tests: the Data check's warn count and the title pill render with `chip warn`;
  the neutral and ok counts and the fix links render with `chip`.

## Capture

One capture, en/light/1280x800, `UX_AXE=0`, against the cached main baseline. Expected:
five screens change, each by 324 px in the one box of the warn count
(`09-dashboard-data-check`, `31-property-data-check`, `68-data-check-out-of-range`,
`03-dashboard-asof-5y`, `03b-dashboard-real-asof-5y`); every other screen 0 px.
