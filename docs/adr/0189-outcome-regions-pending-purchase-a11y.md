# 0189. Outcome banners announce once; a pending purchase reads clearly

- Status: Accepted
- Date: 2026-10-13
- Source: issues #274 (items 1–3), #278 (items 1, 3, 4), #282 (item 4) and #174 (item 3),
  follow-ups of the reviews of PRs #273, #277, #281 and #100; owner decisions 2026-10-11
  (#278.1: date and a link only; #278.4: nominal amounts accepted) and 2026-10-13 (the
  rest); Track 14 PR N10a
- Amends: [0154](0154-one-outcome-path.md) (§1, §2), [0156](0156-pending-purchase-display.md)
  (§3, §4), [0158](0158-layouts-hold-in-czech-and-russian.md) (band badges),
  [0116](0116-prepayments-ui-and-review-fixes.md) (decision 11: row editor)

## Context

1. Each page renders its own app shell, so the toast region and the kept notice and
   failure (ADR 0154) mounted again on every page change. A toast that outlived a page
   landed in a region that was just created, and a screen reader could read the kept notice
   or failure again on every page.
2. A failure appears at the top of the page. An owner scrolled down to the Import button
   did not see an import that failed while writing.
3. The Not owned yet panel on a pending purchase's page repeated the price and loan of the
   Acquisition section on the same page, in nominal Kč under either lens.
4. A pending row on Properties shows "—" in its figure columns. A screen reader moving cell
   by cell heard "dash" or nothing; the reason sat only in the name cell.
5. A band badge that wraps to two lines (ADR 0158) kept its fully round ends, which crowd
   the corners of the text.
6. A loan event row whose save failed on an engine rule (for example a date before the
   loan starts) was described as wrong, but none of its inputs was marked invalid and
   nothing on screen turned red.

## Decision

1. **One toast region.** The toast's live region is mounted once, in the app frame next to
   the page, so it survives page changes. It is fixed to the bottom of the window, so
   nothing moves on screen.
2. **Announced once.** The kept notice and failure keep their live role (`status`,
   `alert`) only where they first appear. On later pages they stay visible, unchanged,
   without a live role, until dismissed. A new notice or failure is announced again.
3. **The failure comes into view.** A failure banner, where it first appears, scrolls into
   view (nearest edge). Focus does not move; the alert is announced.
4. **Not owned yet panel.** It lists only the purchase date and a link,
   `propertyDetail.notOwnedFundingLink`, that jumps to the Acquisition section, where the
   price and loan already are. #278.4 (nominal amounts unlabelled under the real lens) no
   longer applies: the panel shows no amounts.
5. **"—" says why.** Each "—" in a pending row's figure columns carries hidden text
   `properties.notOwnedCell` for screen readers; the visible dash stays.
6. **Wrapped band badges** use a 10 px corner radius instead of a full pill. A one-line
   badge looks the same.
7. **Whole-row marking.** A loan event row with an error marks every input in it invalid
   (`aria-invalid`), and each takes the red border of an invalid field, so the row does
   not shift. Per-cell mapping of engine errors is not done.

New dictionary keys: `properties.notOwnedCell`, `propertyDetail.notOwnedFundingLink`. No
existing text changes.

## Consequences

- No computed number, parity target, golden master, stored data or export changes.
- Screenshot changes: the pending property's page (shorter panel) and wrapped band badges.
- Page tests that check the toast render the toast region next to the page.
- Not covered: the app shell's stale-data and edit-error banners still mount with
  `role="alert"` on every page (#350). Not tested with VoiceOver: WebKit may not announce
  a `status` node inserted with its text, so the notice's first announcement is not
  guaranteed; a persistent status region, as the toast has, is the follow-up (#350).
- Tests: `uiStoreOutcomes.test.ts`, `OutcomeRegions.test.tsx`, `LifecycleStates.test.tsx`,
  `MortgageEventRows.test.tsx`.
