# 0097. Scenario compare: Values / Δ vs Base view

- Status: Accepted
- Date: 2026-10-03
- Source: issue #53 (Scenarios critical review after #15)

## Context

The Scenario compare key figures show Δ vs Base only for net worth (ADR 0089). For starting
equity, the multiple, CAGR, cumulative net cash flow, levered IRR, the first cash-flow-positive
year and the debt-free year the user must subtract in their head, although "how much worse
than Base" is the main question in a stress test.

## Decision

1. The Key figures panel gets a "Values | Δ vs Base" toggle in its header. It is shown only
   when Base is in the comparison; without Base the table shows values. The choice is kept
   while the page is open, so ticking Base again brings Δ mode back.
2. In Δ mode each scenario cell shows the scenario's value minus Base's, computed from the
   full-precision engine outputs and rounded only for display:
   - money (starting equity, net worth nominal and real, cumulative net cash flow): signed
     M Kč, e.g. "−18,6 M Kč", "+0,4 M Kč", "0,0 M Kč";
   - rates (CAGR, levered IRR): signed percentage points, e.g. "+0,5 pp";
   - net-worth multiple: signed, e.g. "+0,68x";
   - years (first cash-flow-positive year, debt-free year): signed whole years, e.g. "+3y".

   When either side has no value the cell shows "—": a scenario IRR without a value keeps its
   reason note, and a Base value that is missing says "Base has no value". The Base column
   shows "—". Rows follow the Nominal/Real lens as in values mode.

3. In Δ mode the "Δ net worth vs Base" row is hidden: the net worth rows show the same delta.
4. The rebased-returns marks and footnote of ADR 0089 stay in both modes.

## Consequences

Display only; no computed number, parity target, golden master or engine output changes.
