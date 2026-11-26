# 0267. One banner box with three tones: `.error-banner` becomes `.banner.error`

- Status: Accepted
- Date: 2026-11-26
- Source: issue #495, part 5 (code review 2026-11, CR-61, R11-08, tracking #435). The owner
  decided on 2026-11-26 to have one ADR per part, with before/after captures and approval
  before merge. Draft in #495 comment 7180114286 (prototype PR #616), approved by the owner
  on #495 on 2026-11-26 (comment 7180285750, as drafted; open question 1: margins as is, no
  bottom margin on the error banner).
- Related: [0189](0189-outcome-regions-pending-purchase-a11y.md) and
  [0194](0194-banners-once-purchases-column.md) (the kept banners),
  [0094](0094-sample-portfolio-clear.md) (the info banner),
  [0266](0266-one-text-button-class.md) (part 4)

## Context

Line references are to main @ 1d72fd34.

There are three banners in `feedback.css`, and each one repeats the same box:

- `.banner.warn` (`:46-54`): loan warnings (`PropertyDetailBody.tsx:97`) and the acquisition
  note (`AcquisitionPanel.tsx:48`);
- `.banner.info` (`:57-70`): kept notices (`OutcomeRegions.tsx:79`) and the sample banner
  (`SampleBanner.tsx:16`);
- `.error-banner` (`:94-105`): a failed write, with a dismiss button (`ErrorBanner`,
  `primitives.tsx:509`).

All three set the same `padding: var(--s3) var(--s4)`, `border-radius: var(--r-sm)`, a 1 px
solid border and `font-size: var(--fs-13)`. They differ in colour, in layout (info and error
are flex rows) and in bottom margin: warn and info have `margin-bottom: var(--s4)`, and
error has none. The error banner uses a class of its own (`.error-banner`), not the
`.banner` family, so a change to the shared box has to be made in two places.

## Decision

1. **`.banner` is the shared box:** padding, radius, `border: 1px solid` and the 13 px size.
2. **The tones set only what differs:**
   - `.banner.warn`: warn colours and border colour, bottom margin;
   - `.banner.info`: flex wrap layout, accent wash, `--hairline-strong` border, bottom
     margin;
   - `.banner.error`: flex layout with the dismiss button, negative colours and border.
3. `ErrorBanner` renders `className="banner error"`, and `.error-banner` is deleted.
4. **The margins stay as they are** (owner, open question 1). The error banner keeps no
   bottom margin. It sits in the page's flex column (`.page`, `gap: var(--s6)`), so adding
   `--s4` would push the page down by 16 px whenever a write fails.

## Visible effects

None. Every banner keeps its padding, radius, border, font size, colours, layout and
margins; only where the declarations live changes. The `.page.dashboard > .banner` rule
(`charts.css:13`, `margin-bottom: 0`) now also matches the error banner on the Dashboard.
The error banner has no margin to remove, so nothing changes there either. Its role
(`alert`, or none for a kept banner, ADR 0189) does not change.

## Customer view

A user would not notice: the banners look exactly as before. The three banners already
look like one family to a user, and after this change the code agrees, so a later change
to the box (the radius, say) reaches all three at once and they can't drift apart.

## Tests

Written first and failing on main:

- A CSS test: `.banner` alone sets the box properties; the three tones set only colour,
  layout and margin; each tone's box plus tone gives exactly the declarations it had on
  main; and no `.error-banner` rule or class name is left.
- The test selectors move from `.error-banner` to `.banner.error` in four files:
  `ShellLifetime`, `AppShellBanners`, `FailedEditShownOnce` and `support/shownErrors.ts`.
  The roles (`alert` / none) the tests read do not change. Run against main's
  `ErrorBanner`, these find no banner and fail.

## Capture

One capture, en/light/1280x800, `UX_AXE=0`, against the cached main baseline at b8ab5e99,
which differs from this branch's main only by #607's change to `20e-property-invalid-data`
(12,181 px, the same on both sides). Expected and found: every other screen 0 px. The capture covers the info banner (the sample banner
on the Dashboard screens and `82-load-sample-banner`, the kept notices) and the warn banner
(loan warnings on Property detail, the acquisition note). No capture screen shows the
error banner, which appears only after a failed write; the CSS test above shows that its
declarations are unchanged.
