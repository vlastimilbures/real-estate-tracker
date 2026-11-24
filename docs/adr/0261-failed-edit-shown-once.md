# 0261. A failed edit is shown once, where it was started

- Status: Accepted
- Date: 2026-11-24
- Source: #467 (plan in #467 comment 7125273536, question Q1), approved by the owner on
  2026-11-24 (Q1 = B, #467 comment 7125385482; Q2–Q5 kept as recommended, #467 comment 7125571852)
- Amends: [0141](0141-form-errors-stay-in-form.md) §1 and §2 (the store no longer puts any
  failure in the banner; a caller with no place of its own puts it there)
- Related: [0154](0154-one-outcome-path.md) (whole-database failures keep their failure
  area), [0189](0189-outcome-regions-pending-purchase-a11y.md) (what the outcome regions
  announce), [0241](0241-property-form-keeps-input.md) §3 (the property form shows a failed
  save), [0248](0248-focus-after-busy-actions.md) (focus after a busy action, §4 for
  Assumptions), [0228](0228-read-back-failure-stops.md) (a failed read-back stops on the
  error screen)

## Context

When a write fails for a reason that is not an input rule (a full disk, a schema
constraint, a missing row), the store puts the failure in the page banner
(`src/state/portfolio/writeRunner.ts:94`, and `:73` for a write refused because the
database is not open or a read-back failed). Since ADR 0141 the store leaves input-rule
errors to the caller, but every other failure still goes to the banner.

The callers also show the failure in their own place: the record, property and scenario
forms on the field or above their buttons, the confirm row under its row, and Activate
next to its button. So the same failure appears twice and is announced twice, once by the
banner's alert and once by the caller's. With a dialog open the banner sits under the
dialog, and it stays after Cancel, describing an edit that is no longer on screen.

A write that fails this way is very rare in real life: the input rules catch what the
owner can do wrong, and the rest needs a failing disk or a damaged database.

## Decision

1. **The store never puts a failure in the banner.** A write returns its failure to the
   caller and leaves the banner `error` as it was. The store still clears the banner after
   a successful write, as today.
2. **A caller with its own place shows the failure there only:** the record forms, the
   property form and the scenario form (on the field it names, else the form's line above
   the buttons), the confirm row of a delete or Deactivate, and Activate.
3. **A caller with no place of its own puts the failure in the banner** with `showError`:
   Keep exploring (dismissing the sample banner), adding a scenario from a preset,
   Duplicate, and an Assumptions save that fails for a reason other than an input rule
   (#467 Q2: as today, with focus back on Save when nothing is listed, ADR 0248 §4).
4. **Unchanged:** the texts and their dictionary keys, where focus goes (ADR 0248), when
   the banner clears, the whole-database failures and their failure area (ADR 0154), and
   input-rule errors (ADR 0141 §3–§6).

## Consequences

- A failed edit shows one copy and is announced once, where it was started. Cancel leaves
  nothing behind.
- Residual case: a confirm row, or Activate, that the owner leaves by going to another
  page while its write fails shows the failure nowhere: the page that would show it is
  gone. The write changed nothing (each write is one transaction), so the row is still
  there to delete again, and the property still inactive to activate again.
- No new dictionary key, no change to texts, numbers or stored data, and no change to the
  ux-capture screens: none captures a failed edit's banner.
