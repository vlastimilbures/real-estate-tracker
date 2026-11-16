# 0237. Property names are compared in one Unicode form

- Status: Accepted
- Date: 2026-11-16
- Source: issue #455 (code review 2026-11, tracking #435), owner decision 2026-11-16,
  item 2 option A
- Amends: [0148](0148-restore-rules-vs-stored-data.md) §5 (restore no longer compares names
  as `propertyKey` does: it keeps the comparison without NFC)
- Related: [0184](0184-data-layer-write-guards.md) §4 (the form matches names like CSV)

## Context

Every place that compares property names goes through one rule, `propertyKey` in
`src/lib/propertyKey.ts` (D-55): the form's duplicate-name check, the CSV checks for
in-file duplicates and known properties, CSV matching to stored properties and the restore
duplicate check. It trims the name and lower-cases it.

A letter with a diacritic can be written in two Unicode forms: composed (NFC, "á" as one
code point) or decomposed (NFD, "a" plus a combining accent). Both look the same. Text
pasted from some sources or written by other tools can be NFD, while typing in the app
gives NFC. Today a CSV row spelled "Národní" in NFD does not match the stored "Národní" in
NFC: the import adds a second property that looks like the first, and the form accepts a
second name that looks the same as an existing one.

The database constraint `UNIQUE(name)` compares bytes, so the JS key is always the
stricter check.

## Decision

1. When the app compares property names (matching CSV rows to properties, refusing a
   duplicate name), both sides are normalised to NFC before the existing case- and
   space-insensitive comparison.
2. Stored names are not rewritten.
3. Tests, written failing first: a CSV row with the decomposed spelling updates the
   existing property instead of adding one; a name differing only in encoding is refused
   as a duplicate. No figure changes.

## Consequences

- `propertyKey` becomes `name.normalize("NFC").trim().toLowerCase()`.
- The restore duplicate check keeps today's comparison (trimmed and case-insensitive, without
  NFC), so existing backups restore unchanged. A backup that already holds two names
  differing only in encoding is stored data, which this decision does not cover (ADR 0148).
  ADR 0148 §5 no longer says restore compares names as `propertyKey` does.
- Editing a property whose name differs only in encoding from another property's name is
  refused at save.
- A CSV row matches the property with the same spelling; it matches by Unicode form only
  when no stored name is spelled the same way ("the same spelling" is still trimmed and
  case-insensitive, D-55).
- The property search filter (`PropertySelect.tsx`) is unchanged.
- No migration; `src/engine`, figures, parity targets and the golden master do not change.
