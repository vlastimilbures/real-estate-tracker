# Wording log

Approved changes to the app's copy that need no ADR (ADR 0152). Append-only: add new
entries at the end and never rewrite an old one; a later entry may correct an earlier one.

## What belongs here

Only a change to the text of existing i18n dictionary entries (`src/i18n/{en,cs,ru}.ts`),
except text used as an accessible name (`aria-label`, a labelled control) or a live-region
announcement. Anything else needs an ADR (ADR 0001, ADR 0152): a change to a computed number,
a limit or rejection, an export, the stored data, the layout, or what assistive technology
announces (roles, names, live regions). When unsure, write an ADR.

The gate is the same as for an ADR (ADR 0001): the owner's OK and a failing test written
first.

## Entry format

Cite dictionary keys, never the translated strings; the dictionaries hold the current text.

```markdown
### YYYY-MM-DD · #issue / PR #nn

- Keys: `section.key`, `section.otherKey` (en, cs, ru)
- Change: what the text now says or does differently, in one or two sentences
- Rejected: the option that was not taken, and why
- Approved by: owner, YYYY-MM-DD
```

## Entries

### 2026-10-11 · #146 / PR #326

- Keys: `scenarios.sumInflationShock`, `scenarios.sumRateShock` (cs)
- Change: the Czech scenario list summary declines the year word with `csPlural`
  ("na 1 rok", "na 3 roky", "na 5 let") instead of "l." for every count. The sign change
  in the same keys is ADR 0178's.
- Rejected: also renaming the presets (`scenarios.rateForYears`, `scenarios.inflForYears`),
  because a preset is found by its saved name (ADR 0093) and a preset saved under the old
  name would be added a second time; leaving it for a later Czech copy pass.
- Approved by: owner, 2026-10-11

### 2026-10-11 · #260 / ADR 0180

- Keys: `backup.warnOutOfRange` (ru); `dataCheck.outOfRangeFixation`,
  `dataCheck.outOfRangeTerm`, `dataCheck.outOfRangeHorizon` (cs, ru)
- Change: the Russian restore warning says the app uses the values in its calculations
  instead of the awkward "считает с ними". The Czech and Russian out-of-range rows name the
  year word after the value, declined with `csPlural` / `ruPlural` ("60 let", "101 год"), as
  English already says "60 years"; the three entries take the value as a number for it.
- Rejected: leaving the unit to the range in brackets only, because the value then reads
  as a bare number ("doba fixace 60 je mimo…").
- Approved by: owner, 2026-10-11 (#260, all items)
