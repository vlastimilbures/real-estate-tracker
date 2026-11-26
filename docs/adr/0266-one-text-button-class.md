# 0266. One text-button class: `.link-btn` becomes `.link-button.underlined`

- Status: Accepted
- Date: 2026-11-26
- Source: issue #495, part 4 (code review 2026-11, CR-61, R11-08, tracking #435). The owner
  decided on 2026-11-26 to have one ADR per part, with before/after captures and approval
  before merge. Draft in #495 comment 7180113526 (prototype PR #615), approved by the owner
  on #495 on 2026-11-26 (comment 7180285750, as drafted; open question 1: the import
  summary's inline link stays as is).
- Related: [0085](0085-properties-long-names.md) (`.link-button.cell-name`),
  [0260](0260-one-visually-hidden-rule.md) (the first class merge, sr-only)

## Context

Line references are to main @ 1d72fd34.

The app has two CSS classes for "a `<button>` that reads as text":

- `.link-button` (`table.css:198-211`) resets the button to its surrounding text
  (`appearance: none`, no background or border, no padding, `font`/`color`/`text-align:
inherit`, `border-radius: 2px`) and underlines on hover. It is used for table drill-ins
  (`PropertyLink.tsx:21`, with `.cell-name`) and the import summary (`ImportPanels.tsx:355`,
  which `import.css:80` underlines always).
- `.link-btn` (`forms.css:330-342`) does the same reset, minus `appearance`, `text-align`
  and the 2 px radius. It adds `min-height: 24px` (WCAG 2.5.8) and is always underlined. It
  is used three times: the Assumptions error summary's field links (`Assumptions.tsx:124`,
  red via `.error-summary .link-btn`), the mortgage form's "learn more"
  (`LoanTypeSwitch.tsx:45`), and the not-owned panel's funding link (`NotOwnedPanel.tsx:19`).

Two names for one control make it a matter of luck which reset a new link gets. `.btn`
(filled/ghost buttons) and `.icon-btn` (square icon buttons) look and act differently, so
they stay as they are.

## Decision

1. `.link-button` is the one text-button class.
2. The always-underlined, 24 px-tall variant is the modifier `.link-button.underlined`
   (`min-height: 24px; text-decoration: underline`). The three `.link-btn` sites use
   `className="link-button underlined"`, and `.link-btn` is deleted.
3. `.error-summary .link-btn` becomes `.error-summary .link-button`, with the same colour.
4. Out of scope: `.btn` and `.icon-btn`. The import summary's inline link keeps its own
   always-underline rule and no `min-height` (owner, open question 1): `.underlined` would
   add 24 px to a link inside a sentence, which can make that line taller, and WCAG 2.5.8
   exempts inline links.

## Visible effects

The three former `.link-btn` buttons take on `.link-button`'s extra declarations:

- `border-radius: 2px`: no visible effect. At rest the button has no background or border,
  and with keyboard focus `button:focus-visible` (`layout.css:89-95`, specificity 0,1,1)
  sets `border-radius: var(--r-sm)`, which beats `.link-button`'s 2 px (0,1,0), as it did
  before.
- `text-align: inherit`: the labels are one line, so nothing moves.
- `appearance: none`: no visible effect on a button with no background or border.

No visible change, including focus: nothing changes in text, size, colour or the focus
ring.

## Customer view

A user would not notice: the links look the same, at rest and with focus. It is still
clearer, because one class now means "a button that reads as text", and a new link
can no longer get the reset without `appearance: none`.

## Tests

There is no DOM change a component test could see beyond the class names, so the test is
a pin on the stylesheets and the sources, written first and failing on main:

- no `.link-btn` rule or `className` is left;
- `.link-button.underlined` sets `min-height: 24px` and `text-decoration: underline`;
- the error summary's colour rule targets `.link-button`;
- the three sites render with `link-button underlined`, so a site that drops `underlined`
  fails.

Kept as they are: the existing Assumptions error-summary, LoanTypeSwitch and NotOwned
tests, which find the buttons by role and name.

## Capture

One capture, en/light/1280x800, `UX_AXE=0`, against the cached main baseline. Expected:
0 px over tolerance on every screen. The prototype (#615, against 1d72fd34) found 0 of 102
screens over tolerance; `61-settings-assumptions-error`, `25-property-mortgage-development`
and `84-property-pending` show the three buttons at rest and are pixel-identical. No screen
captures them with keyboard focus; the focus ring keeps its radius (Visible effects).

Correction (2026-11-26, review of #621): the draft said the focus outline's corners would
round by 2 px. They do not, because the focus rule's radius wins; the text above says so.
