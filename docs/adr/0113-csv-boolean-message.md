# 0113. CSV boolean error lists every accepted value

- Status: Accepted
- Date: 2026-10-03
- Source: issue #61 (found while writing `docs/csv-import.md`, #29)

## Context

The CSV parser accepts `true`/`false`, `yes`/`no` and `1`/`0` for a yes/no column such as
`garage`, in any case (`src/import/csv.ts`, `optBool`). The error for any other value said
"use true or false" in all three languages, so it hid two accepted spellings. A user whose
spreadsheet writes `1`/`0` or `yes`/`no` could think those are wrong and rewrite them.

## Decision

1. The `invalidBoolean` row error names every accepted spelling:
   - en: `Invalid boolean "…" — use true/false, yes/no or 1/0`
   - cs: `Neplatná logická hodnota „…“ — použijte true/false, yes/no nebo 1/0`
   - ru: `Неверное логическое «…» — используйте true/false, yes/no или 1/0`
2. The parser does not change. The spellings stay English in every language, because they
   are the literal cell values the parser reads.
3. A test pins the English text and checks that each language names the value and all three
   pairs.

Rejected: leaving the message as it was and only documenting the extra spellings in SPEC §6
and the guide. The message is the one place the user sees at the moment of the error.

## Consequences

User-visible wording change under ADR 0001; no computed number, parity target, engine
output, accepted input, schema or backup format changes. SPEC §6 is aligned with the
importer in the same PR.
