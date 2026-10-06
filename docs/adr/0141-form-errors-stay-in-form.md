# 0141. A form's input errors stay in the form

- Status: Accepted
- Date: 2026-10-06
- Source: issue #125 (R4-05, R5-07), Track 10 PR 10.2
- Related: [0095](0095-assumptions-save-row.md) (Assumptions error summary),
  [0123](0123-scenario-rules-every-entry-point.md) (a scenario refusal stays in the form),
  [0128](0128-assumption-bounds.md) §6 (an assumptions edit that breaks a saved scenario),
  [0140](0140-one-form-parser.md) (one parser and message set)

## Context

A store write checks the engine input rules before it writes. When a rule is broken, it throws
an `EngineInputError` (or its subclass `ScenarioRuleError`), and the store both returned the
error and put it into the global `error`, which the AppShell banner shows.

Every form that submits such a write already shows the error itself, on the field it names or
above its buttons. So the same message showed twice: once in the form, once in the banner
(R4-05). The banner also stayed after the user pressed Cancel, describing a draft that was gone.

Separately, a field's error stayed after the user edited the field, until the next save
(R5-07). Only the property form cleared it on edit. The scenario Name is required, but its
field was not marked as required, so assistive technology did not say so.

Which writes can be refused by an input rule, and who calls them:

| Caller                                                 | Form? | Before                                              | After         |
| ------------------------------------------------------ | ----- | --------------------------------------------------- | ------------- |
| RecordForm (valuation, lease, mortgage, holding costs) | yes   | inline + banner                                     | inline only   |
| Property form                                          | yes   | inline + banner                                     | inline only   |
| Scenario form                                          | yes   | inline + banner                                     | inline only   |
| Assumptions                                            | yes   | fields inline; a non-field error only in the banner | error summary |
| Scenarios: add a preset, duplicate                     | no    | banner                                              | banner        |

Deleting a record or scenario, (de)activating a property and dismissing the sample banner run no
input rules.

## Decision

1. **Only form submits drop the banner.** The store no longer puts an input error into the
   global `error`; it only returns it. The global `error` is left as it was. Every other
   failure (constraint, data, other) still sets the banner, as before.
2. **Non-form actions keep the banner.** A new store action `showError(error)` sets the banner.
   The Scenarios page calls it when adding a preset or duplicating a scenario is refused by an
   input rule, since no form is open to show it.
3. **Assumptions shows a non-field input error in its error summary** (ADR 0095). Such an
   error names a field the form does not show. An edit that would break a saved scenario
   (ADR 0128 §6) shows on the level a rate or inflation shock shifts; any other break, e.g.
   a value crash, has no field here and goes to the summary. The summary shows the message,
   takes focus, and goes on the next edit or Discard. A non-input failure still shows in the
   banner only.
4. **Editing a field clears its error**, in RecordForm, Assumptions and the scenario form, as
   the property form already did. In RecordForm this includes a field action's fill (e.g. the
   suggested instalment) and a header patch. Errors on other fields stay until the next save,
   and so does the form-level error in RecordForm and the scenario form.
5. **The scenario Name is marked required** (the label's "\*" and `aria-required`), like
   every other required field.
6. **The form-level write error keeps three presentations:** above the buttons in RecordForm
   and the scenario form, above the footer in the property form, and in the error summary in
   Assumptions. They are not unified here. ADR 0095 gives Assumptions, a long page with a
   sticky Save row, a summary that lists and links the fields; the modal and inline forms are
   short enough that one line above the buttons is seen. Unifying them is a layout change
   outside #125.

## Consequences

- A refused form save shows its message once, in the form. Cancel leaves nothing behind.
- An assumptions save refused by a rule on a field the form does not show now says so in the
  form's error summary, instead of only in the banner at the top of the page.
- A banner left by an earlier failure (constraint, data, other) stays up when a later save
  is refused by an input rule, until a write succeeds or the user dismisses it. Clearing it
  on the refusal would hide an unrelated failure.
- No engine, parity or golden change. No new strings.
