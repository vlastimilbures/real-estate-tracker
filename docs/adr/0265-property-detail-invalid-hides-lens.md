# 0265. Property detail with invalid data hides the Nominal/Real switch

- Status: Accepted
- Date: 2026-11-26
- Source: issue #607 (found in the 2026-11-26 night run, #435; seen in the capture screen
  `20e-property-invalid-data`, PR #606). Owner direction on #607, 2026-11-26: hide the
  switch, ADR first. Draft in #607 comment 7179778390, approved by the owner on #607 on
  2026-11-26 (comment 7180285274, as drafted: Q1 hide, not disabled; Q2 scope is invalid
  Property detail only).
- Related: [0146](0146-app-shell-survives-page-errors.md) §1 (the invalid-data fallback has
  no switch), [0155](0155-lifecycle-states-on-the-pages.md) §2 (pages with nothing to switch
  hide it), DR-146 / UX-056 (Property detail shows the records to fix when the data is
  invalid)

## Context

Line references are to main @ 1d72fd34.

The Nominal/Real switch ("the lens", `SegmentedToggle` named `shell.nominalOrReal`) sits in
every page's top bar unless the page passes `showLens={false}`. The default is `true`
(`src/ui/components/PageFrame.tsx:82`, drawn at `:97`).

The app already hides the switch wherever no figure would change:

- The page boundary's invalid-data fallback: `src/ui/components/PageBoundary.tsx:26`
  (ADR 0146 §1: "no lens toggle").
- Dashboard: with every property deactivated (`src/ui/pages/Dashboard.tsx:73`) and with no
  portfolio (`:82`).
- Projections: with no property or none active (`src/ui/pages/Projections.tsx:53`).
- Scenarios: with no assumptions (`src/ui/pages/Scenarios.tsx:110`) and with nothing to
  compare (`:162`, ADR 0155 §2).
- Property detail itself, when the property is not found
  (`src/ui/pages/PropertyDetail.tsx:131`).
- Pages that never show modelled figures: Properties (`Properties.tsx:162`), Import
  (`Import.tsx:190`), Settings (`Settings.tsx:84`), Guide (`Guide.tsx:124`).

Property detail with invalid stored data does not follow this rule:

- When the engine refuses the property's inputs, the page splits the result into
  `out = null` and `invalid` (`PropertyDetail.tsx:86`).
- It still renders its `PageFrame` with the default switch (`PropertyDetail.tsx:158-186`,
  no `showLens`).
- Without `out`, the view's `body` is null, so everything the lens drives is missing: the
  snapshot tiles and as-of picker (`PropertyDetailBody.tsx:76`), the acquisition panel
  (`:103`), the 30-year projection (`:122`) and the amortization table (`:126`).
- What remains is the invalid-data notice (`:72-74`), Records (valuations, leases),
  Financing (loans) and Holding costs (`:87-120`). These show stored amounts, which the
  lens does not change.

So the switch is shown but does nothing on this page. Pressing it changes only the app-wide
lens (`uiStore.ts:96`, `setMode` at `:306`), which the user sees later on another page.

## Decision

1. **Property detail hides the switch while the property's data is invalid.** It renders
   its frame with `showLens={invalid === null}`. In practice this means "while the page has
   no figures", the same condition that removes the figure sections.
2. **The chosen lens is kept.** Hiding the switch does not change `mode`. Other pages keep
   showing the lens the user chose, and when the data is fixed, Property detail shows the
   switch again with the same choice.
3. Nothing else changes. The title, breadcrumb, review pill, actions (Edit,
   Deactivate/Activate), section nav and the notice stay as they are.

Out of scope (owner, Q2): other pages and states. No other page shows the switch without
figures (Context). An inactive property keeps its figures as a preview (ADR 0155 §3), so it
keeps the switch.

## Visible effects

- Property detail with invalid data: the top bar's right-hand row shows the page actions
  only, and Nominal/Real is gone. The row is right-aligned (`.topbar > .row`,
  `justify-content: flex-end`, `shell.css:250-252`), so Edit and Deactivate move right by
  the switch's width. Their order does not change.
- Property detail with valid data: no change. An inactive property also keeps the switch.
- No change to the text in the language files, to computed numbers or to stored data.
- Screen readers: the "Nominal or real" group is no longer announced on this page in this
  state.

## Alternative considered: show the switch disabled with an explanation

Rejected (owner, Q1: hide).

- **Consistency.** In every other state with no figures (the invalid-data fallback, a
  deactivated portfolio, an empty portfolio, Scenarios with nothing to compare, a missing
  property) the app hides the switch. A disabled switch only here would be a second pattern
  for the same situation.
- **The page already explains itself.** The invalid-data notice at the top names the record
  and the broken rule. A second message on the switch would repeat it in a weaker place.
- **Disabled controls are a poor fit here.** A disabled button is skipped by Tab, so a
  keyboard or VoiceOver user can't reach the reason. In the light theme it is low-contrast,
  and a tooltip on it does not show on keyboard focus. Making it readable would need extra
  work (focusable while disabled, `aria-disabled`, a described-by text) and a new dictionary
  entry for a state that should be brief.
- **Nothing is lost.** The lens is app-wide. A user who wants Real can switch it on any
  other page, and it is kept here when the figures return (Decision §2).
- **When a disabled switch would win:** if users often switch the lens on this page while
  the data is broken, or if the move of the top-bar actions when the data becomes invalid or
  is fixed were confusing. Neither seems likely: invalid stored data is rare (data from an
  older version or an edited backup), and the user's task on this page is to fix a record.

## Tests

In `src/ui/pages/__tests__/PropertyDetailInvalid.test.tsx`, written first and failing on
main where marked:

1. With the broken loan (instalment below interest), the group named
   `shell.nominalOrReal` is absent. Fails on main.
2. A pin that already holds: with the seed portfolio (valid), the group is present.
3. The switch comes back with the same lens. With `mode: "real"`, the broken portfolio
   shows no switch; with the valid portfolio put back, the switch is back with Real
   pressed, and the store's `mode` stayed `"real"` throughout. Fails on main.

## Capture

- Affected: `20e-property-invalid-data` (`ux-capture/screens/propertyDetail.ts:102`).
  Expected diff: the top bar's right side only, where the switch is no longer drawn.
- Expected unchanged: every other screen, including `20`–`20d` (Property detail with valid
  data).
- One capture, en/light/1280, `UX_AXE=0`, against the cached main baseline.
