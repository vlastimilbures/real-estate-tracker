# 0246. A failed save puts focus back on the form's submit button

- Status: Accepted (owner-delegated, night run 2026-11-16; owner review pending)
- Date: 2026-11-18
- Source: issue #538 (a flaky HoldingCostsPanel test traced to a focus bug); the root cause
  and plan posted on #538; non-critical accessibility decisions delegated by the owner for
  the 2026-11-16 night run
- Amends: [0207](0207-holding-costs-read-view.md) §3 (a failed write keeps the form open,
  and now also keeps focus on Save)
- Related: [0141](0141-form-errors-stay-in-form.md) §6 (the failure line above the buttons,
  `role="alert"`), [0123](0123-scenario-rules-every-entry-point.md) (a refused scenario
  save stays in the form), [0241](0241-property-form-keeps-input.md) (the property form
  keeps its input after a failed save), [0157](0157-accessibility-batch.md) §2 (a dialog
  returns focus to its opener when it closes, unchanged here),
  [0143](0143-one-confirm-row.md) (confirm rows, not changed here); issue #489 (one submit
  helper for every form, which keeps this behaviour)

## Context

While a save runs, a form disables its submit button (`disabled={busy}`), so a second
Return or click cannot save twice. When the user pressed that button from the keyboard it
has focus, and a focused element that becomes disabled loses focus: the browser's focus
fixup moves it to `<body>`. jsdom does the same on a timer, which is how issue #538 found
it, as a test that failed about once in 30 runs under load
(`HoldingCostsPanel.test.tsx`, "a failed write keeps the form open …").

After a successful save the form closes and a focus rule of its own applies: the record
panel focuses its Edit pencil (ADR 0207 §3), a dialog returns focus to its opener
(ADR 0157 §2). After a failed save nothing put focus back. The form stays open with the
message, but a keyboard user is on `<body>`: the next Tab starts again at the top of the
page. HoldingCostsPanel's focus effect runs only when its view switches, so it does not
help here.

The same holds for every form whose submit button disables while it saves: the record form
(valuations, leases, mortgages, holding costs), the scenario form and the property form.
That WKWebView applies the fixup like other browsers has not been checked in the app; the
HTML standard requires it.

## Decision

1. **Focus returns to the submit button after a failed save.** When a save ends with a
   failure shown in the form (on a field or in the line above the buttons), the control
   that started the save gets focus back once it is enabled again. That control is the
   submit button (`propertyDetail.saveHoldingCosts`, `common.save`, `common.create`,
   `common.saveChanges`, or a record form's own label), the only one that disables and so
   drops focus. A save started by Return in a field leaves focus in that field, as today.
2. **Focus the user moved is left alone.** Focus is put back only when it is on `<body>`
   or still on that button. If the user moved it elsewhere while the save ran, it stays
   there.
3. **The success path is unchanged:** the form closes and the existing rule places focus
   (ADR 0207 §3, ADR 0157 §2).
4. **The failure text is unchanged.** It is announced by the existing `role="alert"` line
   above the buttons, or shown on its field (ADR 0141 §6, UX-047); no dictionary entry
   changes. The message is not focused: the alert is read without moving focus, and Save
   is where the user was.
5. **One place.** The forms take their busy flag from one hook, `useSaveBusy`
   (`src/ui/hooks`), which remembers the control focused when the save starts and applies
   §1–§2 when the save ends with a failure shown.

Not changed here, listed for the owner on the PR: the destructive confirms (the confirm
row, ADR 0143, and Clear sample, ADR 0094), the Excel export button, the scenario presets
and Duplicate, and the Assumptions Save in the Settings top bar. Each also disables while
its action runs, but needs its own answer (for a confirm, whether focus goes back to the
destructive button or to Cancel).

## Consequences

- After a failed save a keyboard user is still on Save and can fix the input or retry from
  there.
- The HoldingCostsPanel test that flaked now holds every time: focus no longer depends on
  whether React re-enables the button before the fixup runs.
- No computed number, stored data, export, layout or dictionary entry changes. No
  ux-capture screen shows focus after a failed save, so none changes.
