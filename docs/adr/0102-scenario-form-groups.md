# 0102. Scenario form: group levels, shocks and crash; no per-property override

- Status: Accepted
- Date: 2026-10-03
- Source: issue #52 (Scenarios critical review after #15)

## Context

The scenario form put three kinds of input in one grid: five absolute level overrides (%), two
temporary shocks (percentage points + years) and a one-off price crash (% + year). Only the
help text told "Post-fixation reset rate 6 %" (absolute, permanent) apart from "Rate shock at
refix +2 pp" (delta, temporary).

SPEC §7 and CLAUDE.md §4 also listed "optional per-property growth overrides" as a scenario
override, but `ScenarioOverrides` has no such field. Per-property growth exists only on the
property itself (`appreciationOverridePa`, `rentIndexOverridePa`, set in the Properties form),
and the engine prefers it to the assumption level (`projections.ts`, `metrics.ts`:
`property.appreciationOverridePa ?? assumptions.appreciationPa`). A scenario's appreciation or
rent-indexation level therefore does not change a property that has its own rate.

## Decision

1. The form keeps the Name field on top and groups the rest into three fieldsets, each with a
   legend and one line of help (the fieldset's accessible description):
   - **Permanent levels**: the five level overrides. Help: they replace the Base value for the
     whole projection, and a property with its own growth rate keeps it.
   - **Temporary shocks**: the inflation and rate shocks. Help: added on top of the level for a
     number of years, then back to trend.
   - **One-off price crash**: the crash % and its year. Help: cuts all property values once, at
     the chosen year; growth resumes from the lower value.
2. Field labels, field help, placeholders and validation messages do not change.
3. Scenarios gain no per-property override. SPEC §7 and CLAUDE.md §4 drop the claim and state
   the precedence: a property's own growth override wins over a scenario's level. The owner
   chose this over an engine feature (2026-10-03).

## Consequences

Display and documentation only: no computed number, parity target, golden master or engine
output changes. Six new strings (three legends, three help lines) in en, cs and ru. A scenario
that should stress a property with its own growth rate still needs that rate changed on the
property; making a scenario level override it would be a separate engine decision.
