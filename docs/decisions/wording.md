# Wording log

Approved changes to the app's copy that need no ADR (ADR 0152). Append-only: add new
entries at the end and never rewrite an old one; a later entry may correct an earlier one.

## What belongs here

Only a change to the text of existing i18n dictionary entries (`src/i18n/{en,cs,ru}.ts`).
Anything else needs an ADR (ADR 0001, ADR 0152): a change to a computed number, a limit or
rejection, an export, the stored data, the layout, or what assistive technology announces
(roles, names, live regions). When unsure, write an ADR.

The gate is the same as for an ADR: the owner approves the change before it ships, and a test
that asserts the new text is written first where the text is tested.

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

None yet.
