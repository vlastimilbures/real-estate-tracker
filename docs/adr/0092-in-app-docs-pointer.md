# 0092. Guide and About point to the limitations and data-safety docs

- Status: Accepted
- Date: 2026-10-03
- Source: issue #28 (pre-release review 2026-10, findings D06 and D07); follows ADR 0091
  decision 9

## Context

Two user documents now exist: [`docs/model-limitations.md`](../model-limitations.md) describes
what the figures mean and what the model leaves out, and
[`docs/data-safety.md`](../data-safety.md) covers backup, restore and recovery from a failed
upgrade. The README links to them, but the README is outside the app. ADR 0091 decision 9
held back the in-app pointer until the model-limitations document existed.

The app is offline and opens nothing outside itself. About therefore shows its web addresses
as plain, selectable text, with no links (D-64, UX-064).

## Decision

1. In About, the Developer list gains two rows after Source: **Model limits** and **Data
   safety**. Their values are the documents' GitHub addresses, written as plain text the same
   way Feedback and Source are:
   - `github.com/vlastimilbures/real-estate-tracker/blob/main/docs/model-limitations.md`
   - `github.com/vlastimilbures/real-estate-tracker/blob/main/docs/data-safety.md`
2. The Guide ends with a **Limits and data safety** panel. It says the figures are planning
   estimates, not lender quotes, and shows the same two rows.
3. The labels are translated in en, cs and ru, and the addresses are identical in all three.
   Long addresses wrap inside About rather than widening the dialog.

## Consequences

Copy plus one wrapping rule; no computed number, parity target or engine output changes. The
addresses point at `main`, so the documents must keep these paths. A rename needs this copy to
change too.
