# 0034. CAGR is null when starting equity is not positive

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-34, J-25

## Context

Equity CAGR is undefined when starting equity is zero or negative (J-25).

Options considered for J-25 (CAGR when equity₀ = 0 (DR-107)): (a) 0, as for equity₀ < 0; (b) null and the tile shows "—". Recommendation at planning: (b) — a growth rate from zero is undefined, "—" is honest; (a) if the tile must stay numeric

## Decision

**CAGR when equity₀ = 0 (answers J-25):** option (b) — CAGR is `null` when equity₀ ≤ 0 and the tile shows "—".

## Consequences

P4b changes the engine (`greaterThan(ZERO)`, nullable CAGR type; DR-107) and updates the equity₀ < 0 characterisation (today 0 ⇒ null); P7 renders "—" (user-visible under D-01). Seed parity unchanged.
