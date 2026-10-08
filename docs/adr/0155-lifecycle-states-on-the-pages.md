# 0155. Lifecycle states on the pages: deactivated portfolio, inactive property, filter

- Status: Accepted
- Date: 2026-10-08
- Source: issue #127 (2026-10 code review, findings G2-1-05, G2-1-07, G2-1-09, G2-1-12);
  owner decision D11 (2026-10-08: option A; on Scenarios the notice replaces only the
  comparison; an inactive property has no Data check section); Track 11 PR 11.6
- Amends: [0094](0094-sample-portfolio-clear.md) (§6: the empty-portfolio screen is for a
  portfolio with no property; every property deactivated is its own state),
  [0107](0107-property-section-nav.md) (an inactive property shows no loan warnings and
  its section nav has no Data check entry), [0118](0118-data-check.md) (no Data check
  section on an inactive property's page)
- Related: D-55 (a CSV re-import keeps the stored active flag, `csvImport.ts`)

## Context

Deactivating a property is how the owner keeps the history of a sold flat. The engine skips
inactive properties in projections and KPIs (SPEC.md §4.5). The pages around it did not:

1. With every property deactivated, the Dashboard showed the first-run screen
   (`common.noPortfolioTitle`, the Getting-started list, Import). Following it creates
   duplicates. Projections and Scenarios checked only that data was loaded, so they showed
   30 rows of zeros and a comparison of zeros, with Excel exports of zeros. The same held
   for a portfolio with no property at all on those two pages.
2. An inactive property's detail page ran the loan checks, so it raised `role="alert"`
   banners asking for refix terms of a loan the owner no longer has. Since #35 the page's
   Data check repeated those nudges and added stale-valuation and missing-lease ones. The
   inactive note (`propertyDetail.inactiveNote`) did not say that the page's own tiles
   still show the property as if it were active.
3. The Dashboard pruned its saved filter to active properties but treated any non-empty
   filter as a filter. A filter left with one property showed `dashboard.subFilter` for one
   of one, with no control to clear it; selecting every chip showed it for n of n.
4. No page test used the `mixed` fixture, so none of this was caught.

## Decision

1. **One definition.** `portfolioState(portfolio)` in `src/ui/model/portfolioState.ts`
   returns `empty` (no property), `allInactive` with the count (at least one property, none
   active) or `ready`. A property is active unless `active === false`, as in the engine; a
   pending purchase counts as active.
2. **Notice.** `PortfolioStateNotice` shows `empty` as today's `common.noPortfolioTitle` /
   `common.noPortfolioBody`, and `allInactive` as `common.allInactiveTitle(n)` (a count
   string, inflected in cs and ru) with `common.allInactiveBody` and one button,
   `common.openProperties`, to the Properties page.
   - Dashboard: `allInactive` shows the notice under the sample banner (so a deactivated
     sample can still be cleared), with no Getting-started list and no lens toggle. `empty`
     keeps its first-run screen (ADR 0094).
   - Projections: `empty` and `allInactive` show the notice instead of the table and its
     export.
   - Scenarios: the notice replaces only the comparison, and the lens toggle is hidden.
     Presets, the saved list and New scenario stay, because scenarios are assumption
     overrides that apply again once a property is active.
   - Notices and toasts from the app shell (ADR 0154) show on these states as on any page.
3. **Inactive property.** Its page runs no loan warnings and has no Data check section or
   section-nav entry; both return on reactivation. The tiles, charts, projection and loan
   summary stay as a preview before reactivating, and the inactive banner adds
   `propertyDetail.inactivePreviewNote` after `propertyDetail.inactiveNote`.
4. **Filter.** The Dashboard counts as filtered only when the pruned selection is non-empty
   and smaller than the active properties. Otherwise the subtitle is
   `dashboard.subtitleDefault`.
5. **Tests.** `src/ui/pages/__tests__/LifecycleStates.test.tsx` renders Dashboard,
   Projections, Scenarios, Properties and Property detail over `mixed` variants (every
   property deactivated, one deactivated, only a pending purchase active, no property),
   with the real stores and engine.

## Consequences

- The three portfolio pages give the same answer for "nothing to show"; an all-inactive
  portfolio no longer invites the owner to start over.
- Projections and Scenarios also stop rendering zeros for a portfolio with no property.
- New dictionary keys: `common.allInactiveTitle`, `common.allInactiveBody`,
  `common.openProperties`, `propertyDetail.inactivePreviewNote`. No existing text changes.
- No computed number, stored data or export format changes; parity targets and the golden
  master do not move.
- A deactivated property's stale data is no longer pointed out until it is reactivated.
