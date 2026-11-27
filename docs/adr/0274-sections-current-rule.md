# 0274. Section navigation and the collapsed amortization schedule: the current rule

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-27
- Source: issue #498 (owner decision 2026-11-27: implement ADR 0272, then one current-rule
  record each for prepayments, sections and the Data check)
- Supersedes: [0107](0107-property-section-nav.md), [0213](0213-guide-section-nav.md)
- Supersedes in part: [0155](0155-lifecycle-states-on-the-pages.md) (decision 3),
  [0158](0158-layouts-hold-in-czech-and-russian.md) (the "Section nav" item of the
  decision and the section-nav part of its "Checks" item),
  [0203](0203-one-disclosure.md) (the amortization toggle in decisions 2, 3 and 4),
  [0215](0215-property-detail-top.md) (decisions 1, 2 and 4),
  [0223](0223-data-check-blocks.md) (decision 5), [0224](0224-loan-outlook-figure-row.md)
  (decision 1), [0225](0225-sweep-round-2.md) (decision 2)
- Related: [0118](0118-data-check.md) (the Data check and its fix links),
  [0119](0119-acquisition-funding.md) §9 (the Acquisition section),
  [0130](0130-interest-saved-refinance.md) §4, [0159](0159-excel-exports-carry-their-context.md),
  [0164](0164-amortization-due-date.md) (the amortization table's columns and export),
  [0156](0156-pending-purchase-display.md) (a property not owned yet),
  [0157](0157-accessibility-batch.md) (headings, loan warnings as a status),
  [0218](0218-dashboard-pill-and-chart-grid.md) §1 (the title's review pill),
  [0221](0221-settings-top-bar.md) (Settings' tabs in the top bar's section row),
  [0248](0248-focus-after-busy-actions.md), [0258](0258-leftover-block-hint.md) (other
  callers of the section jump), [0265](0265-property-detail-invalid-hides-lens.md) §1–§2
  (the Nominal / Real switch with invalid data), [0272](0272-current-rule-likelihood-ui-rounds.md) (why
  this record exists)
- Topic: Layout: section navigation
- Trigger: n/a (restates accepted rules; adds no handling, ADR 0272 §2)
- Likelihood: n/a (adds no handling)

## Context

ADR 0107 added the section navigation and the collapsed amortization schedule to Property
detail. Seven later records changed it, and one of those (0213, the Guide) was amended
again. ADR 0272 asks for one record that states the rule as it is now. This is that record
for the section navigation, the order of Property detail's sections, the top bar they sit
in, and how the amortization schedule collapses (its toggle and remembered state; its
columns and export are other records', named under Related). It changes no behaviour: every statement below comes
from an accepted record, named in brackets after it. Where the code and the records
disagree, the disagreement is listed on the pull request for the owner and not settled
here.

The superseded records keep their context and measurements. Read them for why a rule is
what it is; read this record for what the rule is.

## Decision

### 1. The section navigation

1. Property detail and the Guide list their sections as in-page links in the last row of
   the sticky top bar. Triage rejected tabs and separate routes, which hide context behind
   a mode (ADR 0107, Context and §1; ADR 0213 §1). The top bar has that row only on a
   page that passes one (ADR 0107, Consequences). Property detail's nav is named
   `propertyDetail.sectionNavLabel` (ADR 0107, Consequences; ADR 0158, Context).
2. A link scrolls its section under the top bar and moves focus to the section's heading.
   It does not change the route, so the unsaved-changes guard is not involved and an open
   record form keeps its draft (ADR 0107 §1; ADR 0213 §2).
3. The section in view is marked with `aria-current="location"` and follows scrolling
   (ADR 0107 §1; ADR 0213 §2). It is measured from below the top bar's current height
   (ADR 0158, "Section nav").
4. **Wrapping.** The links wrap onto more rows instead of scrolling sideways, so every link
   is visible. The sticky top bar grows with them, and a jump still lands its heading below
   the bar, because the section's scroll margin follows the bar's height (ADR 0158,
   "Section nav"; ADR 0213, Consequences).
5. **The Guide in a narrow window.** Below a 1,100 px window the Guide's links sit in one
   row that scrolls sideways, with a fade on the side that has more links. The current
   link is kept in view, clear of the fade, as it changes and as the row resizes; a link
   reached by Tab is scrolled clear of the fade too. Wider windows wrap, and Property
   detail wraps at every width (ADR 0225 §2).
6. **Look.** Each link is padded 8 px a side, on both pages, so Property detail's links
   keep one row at 1280 × 800 (ADR 0215 §4). On Property detail the `ux-capture` layout
   check asserts that no section nav link is clipped, in every language (ADR 0158,
   "Checks"). The Guide's one row in a narrow window hides links off to the side by
   design (1.5).

### 2. Property detail's sections

1. **Order.** Overview → Records → Financing → Holding costs → Projection → Amortization
   (ADR 0107 §3), with the Acquisition section after Financing (ADR 0119 §9). The Data
   check is the last section, after Amortization, and the section nav and the Tab order
   follow that move (ADR 0223 §5).
2. **Only sections on the page are listed.** With stored data that breaks an engine rule
   the page has, and the nav lists, only Records, Financing and Holding costs
   (ADR 0107 §1).
3. **Overview** has a heading for screen readers only, as the focus target for its link;
   the tiles area looks the same (ADR 0107 §2). It holds the as-of picker and the tiles
   (ADR 0107, Context; ADR 0215 §3), the charts (ADR 0215 §5) and, right after the charts,
   the Loan outlook, which has no nav entry of its own (ADR 0224 §1). A property not owned
   yet shows its "Not owned yet" panel instead of the tiles (ADR 0156; ADR 0215 §5).
4. **Financing** holds the mortgage blocks and, under them, the loan warnings
   (ADR 0107 §3; ADR 0224 §1).
5. **Data check.** When something needs attention, the page title shows the amber review
   pill; it moves focus to the Data check heading (ADR 0223 §5).
6. **An inactive property** runs no loan warnings and has no Data check section or nav
   entry; both return on reactivation. Its tiles, charts, projection and loan summary stay
   as a preview, and the inactive banner adds `propertyDetail.inactivePreviewNote` after
   `propertyDetail.inactiveNote` (ADR 0155 §3).

### 3. Property detail's top bar

1. **Breadcrumb.** Before the property's name, on the title's line, the top bar shows a
   link "Properties" (`nav.properties`) followed by a decorative "›". It returns to the
   Properties list through the same guarded navigation as every way off the page, and is
   the top bar's first focusable element, before the actions (ADR 0215 §1).
2. **Actions.** "Edit property" is the primary action, first; "Deactivate" / "Activate" is
   a default button after it. Below a 1,100 px window that button shows only its icon: its
   label stays its accessible name as screen-reader text, and its tooltip still explains
   it. At 900 × 600 the actions sit as one row under the title (ADR 0215 §2).
3. **The Nominal / Real switch** is hidden while the property's stored data is invalid,
   that is while the page has no figures. Hiding it does not change the chosen lens: other
   pages keep showing it, and when the data is fixed the switch comes back with the same
   choice (ADR 0265 §1, §2). An inactive property keeps its figures, so it keeps the
   switch (ADR 0265, "Out of scope").
4. The section links are the top bar's last row (1.1).

### 4. The amortization schedule: collapse, toggle and open state

1. The schedule is collapsed by default. Its panel head (title, payment count, Excel
   export) is always shown, so export works while it is collapsed (ADR 0107 §4).
2. The toggle is the shared disclosure button (`DisclosureButton`) in the panel head,
   before "Export to Excel": "Show amortization schedule (N payments)"
   (`propertyDetail.showAmortization`) while shut, `propertyDetail.hideAmortization` while
   open, with `aria-expanded` and `aria-controls` naming a region that is always in the
   DOM and hidden while shut (ADR 0107 §4; ADR 0203 §1, §2, §4).
3. The open state is remembered for the app session, across properties, and resets when
   the app restarts (ADR 0107 §4; ADR 0203 §3).

### 5. The Guide

1. The Guide's top bar carries the same section navigation, named `guide.sectionNavLabel`
   ("Guide sections"), with one link per section in page order, each labelled with its
   section's title: How it works, Snapshot metrics, Mortgages & fixation, Projection to the
   horizon, Nominal vs Real, Returns over the horizon, Scenarios, Development properties,
   Glossary, Limits and data safety (ADR 0213 §1).
2. It behaves as on Property detail (1.2, 1.3), and wraps or takes one row as 1.4 and 1.5
   say (ADR 0213 §2; ADR 0225 §2).
3. Opening the Guide lands at its top; a glossary term opened from a metric label still
   lands on that term (ADR 0213 §3).
4. The Guide's sections reuse Property detail's section wrapper and its scroll margin
   (ADR 0213, Consequences).

## Consequences

- ADRs 0107 and 0213 are superseded by this record. ADRs 0155, 0158, 0203, 0215, 0223,
  0224 and 0225 are superseded in the parts named in the header; their other decisions
  stand.
- A change to the section navigation, Property detail's section order or top bar, or how
  the amortization schedule collapses amends this record, not the superseded ones (ADR 0272 §1).
- No behaviour, layout, dictionary entry, parity target or golden-master value changes.
