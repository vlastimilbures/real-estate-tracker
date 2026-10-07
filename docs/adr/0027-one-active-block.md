# 0027. One active mortgage block per property

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-27, J-14
- Amended by: [0130](0130-interest-saved-refinance.md) (D-47: the handover row)

## Context

The spec summed active-block balances yet defined a single active block (spec finding J, J-14).

Options considered for J-14 (Concurrent or successor mortgage blocks per property): (a) one active block (successor replaces predecessor); (b) true concurrent loans that are summed. Recommendation at planning: Decide from P2 evidence and the real loans. P02: owner evidence (2026-09-30) — real loans are successive only ⇒ (a) + follow successors (DR-030) + reject overlaps (DR-103)

## Decision

**Mortgage blocks per property (answers J-14):** option (a) — one active block; a successor replaces its predecessor from its start date (the owner's real loans are successive only). Overlapping (concurrent) blocks are rejected at every entry point with a precise message; the engine raises a typed error.

Related follow-up decisions:

- **D-43**: **Definition of "overlap" for D-27 (answers DR-116):** two blocks of one property overlap only when they have the same start date (DUPLICATE_BLOCK_START, a typed error). Any block with a later start is a successor that replaces its predecessor from its start date. A non-blocking warning is shown when a successor starts before its predecessor's fixation end (it may be a top-up that would hide the main loan, DR-103).
- **D-47**: **Refinance handover (completes D-27/D-43, DR-030):** a successor draws in the first grid month on/after its start. (1) Predecessor payments due on or before the successor's start are still paid; one that falls in the draw month is carried by the draw row (its interest, principal and instalment), which ends at the successor's principal. Payments due after the start are dropped. (2) Net refinance cash = successor principal − predecessor balance paid off, counted in the handover year in cumulative net cash flow and levered IRR (like the acquisition outflow); projection rows are unchanged.

## Consequences

P4b makes the schedule follow successors starting after baseDate (DR-030) and adds the typed error (DR-103); P5b/P7 add the entry-point rejection (user-visible under D-01). No seed parity change.
