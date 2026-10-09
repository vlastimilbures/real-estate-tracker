# 0099. Offer to close the previous open-ended valuation or lease

- Status: Accepted
- Date: 2026-10-03
- Source: owner request (2026-10-03)
- Amended by: [0144](0144-small-user-visible-corrections.md) (decision 3: no prompt for a
  dated new record), [0163](0163-leases-never-overlap.md) (leases: adding one ends the open
  predecessor without asking)

## Context

Valuations and leases are effective-dated. A record with no end date (`validTo` / `endDate`)
stays in force until a later record starts ("latest start wins", `lastOnOrBefore` in
`src/engine/dates.ts`). When the owner adds a new valuation or a new rent, the previous record
keeps its blank end date. The numbers are right, because the newer start wins. The tables,
though, show two open-ended "current" rows, and the owner closes the old one by hand.

## Decision

1. When a **new** valuation or lease is added, the app looks for the open-ended record of the
   same property with the latest start strictly before the new record's start.
2. If one exists, a dialog asks whether to end it on **the day before the new start**. End dates
   are inclusive, so this leaves no gap and no overlap.
   - **End previous record** adds the new record and sets the previous record's end date.
   - **Keep as is** adds the new record and leaves the previous record unchanged.
   - Closing the dialog (Esc or ✕) adds nothing and returns to the form with the input kept.
3. There is no prompt when no open-ended record starts before the new one, when the new record
   ends before that record starts, or when an existing record is edited.
4. The insert and the end-date update are one atomic write through the Rust transaction command
   (ADR 0014). Both rows pass the engine input checks first.
5. Only valuations and leases. Mortgage blocks keep their successor rule (ADR 0027), and holding
   costs are not dated.

## Consequences

The data gets a closed history instead of several open rows. No computed number changes: from
the new start onward the new record already won, and before it the previous record is still in
force. No parity target or golden-master change. One new dialog and its strings in en, cs and ru.
