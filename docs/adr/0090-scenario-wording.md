# 0090. Scenarios wording: shock units, projection start, compare limit, lens

- Status: Accepted
- Date: 2026-10-03
- Source: issue #15 (pre-release review 2026-10, findings A09 and D03(d))

## Context

The Scenarios page wording contradicts the model in several places:

1. The preset hint says "shocks revert after 3y" above the price-crash presets, which are a
   permanent level change.
2. Rate and inflation shock fields are labelled "+pp" but show a "%" suffix, and the scenario
   list summary formats the delta as a percentage ("rates +2,0 % for 3y"). A +2 pp shock can
   read as "+2 % of the rate".
3. The crash timing button "Today" and the form help "0 = base date" mean projection year 0,
   which is the projection start, not the calendar date.
4. "pick up to 3 to compare against Base" does not say whether Base counts toward the 3.
5. The Nominal/Real lens toggle is hidden on Scenarios, although Compare honours the lens.

## Decision

1. The preset hint says one click saves a scenario, rate and inflation shocks last N years and
   then revert, and a price crash is permanent.
2. Shock deltas use a percentage-point unit everywhere: the input suffix is "pp" (cs "p. b.",
   ru "п. п."), the help gives a worked example (+2 pp turns 4.5 % into 6.5 %), and the list
   summary shows "+2,0 pp".
3. Crash timing year 0 is labelled "Start" with a tooltip "At projection start (date)". The
   form help reads "0 = projection start (date)", the term the sidebar uses. The Guide's
   value-crash entry says "at projection start" instead of "at Today".
4. The compare limit stays 3 saved scenarios; Base stays a separate toggle (the Δ net worth
   row of ADR 0089 needs it). The hint says so: "Tick up to 3 scenarios to compare. Base is
   extra and does not count."
5. Scenarios shows the Nominal/Real lens toggle, so the compare table and charts switch in place.

## Consequences

Copy and layout only; no computed number, parity target or engine output changes.
