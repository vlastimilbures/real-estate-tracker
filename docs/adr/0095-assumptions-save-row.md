# 0095. Assumptions: sticky Save row, unsaved state and error summary

- Status: Accepted
- Date: 2026-10-03
- Source: issue #19 (pre-release review 2026-10, findings A04 and F4)

## Context

In Settings → Assumptions the only **Save changes** button sits at the top, above two long
groups of fields. An error in the second group can be off-screen from the button, nothing on
the page says the form holds unsaved edits (only the leave guard knows), and a failed save
lists its errors only next to each field. The property record forms put Cancel and Save at the
bottom of each form instead.

Saving stays explicit for financial inputs: there is no autosave.

## Decision

1. **Sticky action row.** The Assumptions buttons move from the top to a row at the bottom
   of the form that stays in view while the page scrolls (`position: sticky; bottom: 0`). The
   "Scenarios override these" hint stays at the top as an intro line.
2. **Buttons.**
   - **Discard changes** resets the draft to the saved values without asking. It is disabled
     while there are no unsaved edits.
   - **Save changes** is disabled while there are no unsaved edits and reads **Saving…** while
     the save runs.
3. **State text** in the row, always shown:
   - **Unsaved changes** while the draft differs from the saved values;
   - **All changes saved** when it does not;
   - **Save failed — your input is kept** after a failed save, until the next edit.

   The success toast "Assumptions saved — projections updated" stays.

4. **Error summary.** When a save finds invalid fields, a summary appears above the action
   row: "N fields need attention:" followed by each field's label as a link. A link moves focus
   to its field. A failed save moves focus to the summary, and the summary is announced. The
   per-field messages stay.
5. **Never hidden.** A focused field scrolls into view above the sticky row
   (`scroll-margin-bottom`). The last field is never covered, at 1280×800 and at the minimum
   window size (900×600).
6. **Record forms.** The property record forms (valuation, lease, mortgage, holding costs)
   show **Unsaved changes** next to their buttons while they hold unsaved edits. Their layout
   does not change. The property modal already guards unsaved input and is unchanged.
7. All new text is translated in en, cs and ru.

## Consequences

User-visible UI change under ADR 0001; no computed number, parity target or engine output
changes. The leave guard (UX-030) works as before. Discard changes and a save both clear its
unsaved flag.
