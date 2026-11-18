# 0209. Acquisition funding: a compact line while nothing is recorded

- Status: Accepted
- Date: 2026-11-16
- Source: issue #387 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's layout); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amends: [0119](0119-acquisition-funding.md) (§9: how the Property detail Acquisition
  section shows a purchase with no funding recorded)
- Related: [0118](0118-data-check.md) (the own-cash finding and its "Record funding"
  fix)

## Context

With no funding recorded, Property detail's "Acquisition funding" is seven rows, most of
them "—", then a three-line note explaining what "—" means. That is the case for every
sample property and for any property imported without funding: a panel of placeholders
that says one thing, "not recorded".

## Decision

1. **Compact state.** When no transaction costs, initial works, own cash or funding note
   is recorded, the panel body is one line and a button (`acquisitionView` returns
   `emptyLine`), `propertyDetail.acqEmpty(price, loan)`: "Purchase price 6 375 000 Kč ·
   no acquisition loan · costs, works and own cash are not recorded." When there is an
   acquisition loan (it comes from the loan blocks, not from the funding fields), the line
   names it instead: "… · acquisition loan 5 610 000 Kč · …". So the compact state keeps
   every fact the table showed: the price (= the uses), the loan or its absence ("None"),
   and that the rest is not recorded.
2. **Record funding.** A regular (not primary) button beside the line, labelled
   `dataCheck.recordFunding` ("Record funding"), the label the Data check's own-cash fix
   uses, so a change to it changes both. It opens the property form with its Acquisition
   section open and focus on own cash (the `editFunding` target of ADR 0118). Its
   description, `propertyDetail.acqRecordFundingOpens` ("Opens Edit property at its
   Acquisition section."), says what it opens. Cancel returns focus to the button; after a
   save the button is gone with the line, so focus lands on the section's heading.
3. **Full table** as soon as any cost, works, own cash or note is recorded (0 Kč counts):
   unchanged, with its sources-vs-uses warning and note.
4. The hint (`acqHint`) and the panel's place on the page are unchanged. The line and the
   button sit side by side; the line wraps, or the button drops under it, when narrow (at
   most two lines in any language).

## Consequences

- A property with no funding recorded (every sample property, until funding is recorded)
  shows one line instead of seven rows and a note.
- No computed number, stored data or export changes; the sources-vs-uses check (ADR 0119)
  is untouched.
- New dictionary entries in en, cs and ru: `acqEmpty`, `acqRecordFundingOpens`.
