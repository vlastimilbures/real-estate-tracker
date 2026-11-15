# 0214. Panel headers hold context; explanations become help text

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #391 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's decision); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Related: [0203](0203-one-disclosure.md) (the shared disclosure)

## Context

A panel's header hint sits beside its title. Short hints ("nominal Kč") fit; sentences
wrapped the header to two lines (Valuations in en, cs and ru, Leases in ru at 1280 × 800),
and some panels stacked small-print paragraphs (the Dashboard's Financing panel in the
real lens, the drawdown under a development loan's outlook).

## Decision

1. **Header hint = context only**: a unit, lens, count or date on one line. The ux
   capture checks every panel header at 1280 × 800 and wider stays on one line, in en, cs
   and ru.
2. **Explanations go into the body** (`Panel` `help`, `HelpText`): one muted help line at
   the top of the body, or, when longer than about one line, behind an "About this"
   disclosure (`common.aboutThis`, the shared disclosure of ADR 0203, keyboard reachable).
3. **One note per panel at the bottom**; a disclaimer that must stay visible (modelled
   dates, not lender deadlines) stays visible.
4. **Moved texts** (wording unchanged, nothing removed):

   | Text                             | Was                           | Now                                                 |
   | -------------------------------- | ----------------------------- | --------------------------------------------------- |
   | `propertyDetail.valuationsHint`  | Valuations header hint        | "About this" disclosure atop the panel body         |
   | `propertyDetail.leasesHint`      | Leases header hint            | help line atop the panel body                       |
   | `scenarios.presetsHint`          | Stress presets header hint    | help line atop the open presets                     |
   | `propertyDetail.drawdownNote`    | note under the drawdown table | "About this" disclosure under the drawdown progress |
   | `dashboard.financingRowsNominal` | second note (real lens)       | joined to the disclaimer as one note                |

   Every other header hint already is context, and every other panel ends with at most
   one note. The backup panels' paragraphs introduce their actions and stay.

## Consequences

- Panel headers are one line and the same height; explanations are still on the page,
  visible or one click away.
- No computed number, stored data or export changes; no dictionary text changes.
- New dictionary entry in en, cs and ru: `common.aboutThis`.
