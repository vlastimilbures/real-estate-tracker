# 0214. Panel headers hold context; explanations become help text

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #391 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's decision); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amended by: [0217](0217-info-tip.md) (definitions move to an info icon in the head; the
  "About this" disclosure is removed)
- Amends: [0106](0106-collapsible-stress-presets.md) (the presets' explanation shows only
  while the presets are open; collapsed, the one-line summary stands alone)
- Related: [0203](0203-one-disclosure.md) (the shared disclosure),
  [0209](0209-acquisition-empty-state.md) (focus after Record funding, kept),
  [0173](0173-record-panel-races-confirm-focus.md) (where focus goes when its opener has left)

## Context

A panel's header hint sits beside its title. Short hints ("nominal Kč") fit; sentences
wrapped the header to two lines (Valuations in en, cs and ru, Leases in ru at 1280 × 800),
and some panels stacked small-print paragraphs (the Dashboard's Financing panel in the
real lens, the drawdown under a development loan's outlook).

## Decision

1. **Header hint = context only**: a unit, lens, count or date on one line. The ux
   capture checks every panel header at 1280 × 800 and wider stays one row (the title on
   one line, the hint beside it, the head's actions beside the titles), in en, cs and ru.
   The app's default 1200 × 800 window is not checked: a long Russian title with a hint
   may take a second line there.
2. **Explanations go into the body** (`Panel` `help`, `HelpText`): one muted help line at
   the top of the body, or, when longer than about one line, behind an "About this"
   disclosure (`common.aboutThis`, the shared disclosure of ADR 0203, keyboard reachable).
   The disclosure's accessible name ends with the panel or section it explains, as
   screen-reader text ("About this: Valuations"), so two on a page differ.
3. **One note per panel at the bottom**; a disclaimer that must stay visible (modelled
   dates, not lender deadlines) stays visible.
4. **Moved texts** (wording unchanged, nothing removed):

   | Text                              | Was                               | Now                                                 |
   | --------------------------------- | --------------------------------- | --------------------------------------------------- |
   | `propertyDetail.valuationsHint`   | Valuations header hint            | "About this" disclosure atop the panel body         |
   | `propertyDetail.leasesHint`       | Leases header hint                | help line atop the panel body                       |
   | `scenarios.presetsHint`           | Stress presets header hint        | help line atop the open presets                     |
   | `propertyDetail.drawdownNote`     | note under the drawdown table     | "About this" disclosure under the drawdown progress |
   | `dashboard.financingRowsNominal`  | second note (real lens)           | joined to the disclaimer as one note                |
   | `propertyDetail.mortgagesHint`    | Mortgage blocks header hint       | help line atop the panel body                       |
   | `propertyDetail.holdingCostsHint` | Holding costs header hint         | help line atop the panel body                       |
   | `propertyDetail.notOwnedHint`     | Not owned yet header hint         | help line atop the panel body                       |
   | `propertyDetail.acqNote`          | note under Acquisition funding    | "About this" disclosure atop the panel body         |
   | `scenarios.listHint`              | Scenarios header hint             | help line atop the panel body                       |
   | `assumptions.defaultsHint`        | Holding-cost defaults header hint | help line atop the panel body                       |
   | `importPage.dropOnRow`            | Import files header hint          | help line atop the panel body                       |
   | `backup.exportHint`               | Export backup header hint         | help line atop the panel body                       |

   The header hints that stay are context: a lens or unit (`acqHint` "as recorded,
   nominal", the projection panels' "nominal Kč"), a count or a date. Acquisition
   funding's recorded note (`acqRecordedNote`) is the owner's own text and its one note.
   The backup panels' paragraphs introduce their actions and stay; Data check's as-of line
   follows its list. The Guide is out of scope (#391).

5. **Focus.** After Record funding saves, focus still lands on the Acquisition heading
   (ADR 0209 §2): the page checks whether the button that opened the form has left the
   page, rather than whether focus was lost, since the dialog's fallback (ADR 0173) would
   otherwise land on the panel's "About this".

## Consequences

- Panel headers are one line and the same height; explanations are still on the page,
  visible or one click away.
- No computed number, stored data or export changes; no dictionary text changes.
- New dictionary entry in en, cs and ru: `common.aboutThis`.
