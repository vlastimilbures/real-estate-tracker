# 0098. Mortgage form: Standard vs Development switch and successor note

- Status: Accepted
- Date: 2026-10-03
- Source: issue #20 (pre-release review 2026-10, finding A08); builds on ADR 0024, ADR 0027
  and ADR 0031

## Context

The mortgage form shows all nine fields at once. They include the development-loan fields:
tranche draws as `dd.mm.yyyy = amount` lines and the completion date, which ends the
interest-only phase. A user adding an ordinary mortgage has to work through construction-loan
concepts first.

The form also does not say that a second block **replaces** the earlier one from its start
date (ADR 0027: one active block per property). The block is a refix or refinance successor,
not a second loan running at the same time. Today this only shows up later, in the
expired-fixation warning.

## Decision

1. **Loan type switch.** The mortgage form starts with a **Loan type** segmented control:
   **Standard** | **Development (construction)**.
   - Standard hides the draws and completion-date fields.
   - Development shows them with their existing help text.
   - Every other field, including contract maturity, shows in both modes. There is no
     "Advanced" disclosure.
2. **Type from the data.** The type is not stored. A block with draws or a completion date
   opens as Development, and any other block opens as Standard. A new block starts as Standard.
   Saving round-trips the block unchanged, with no data or engine change.
3. **Switching back clears with a confirm.** Switching from Development to Standard while
   draws or a completion date are entered shows an inline confirmation:
   "Standard clears the draws and the completion date." with **Clear and switch** and **Keep
   development**. Nothing is saved until the user saves the form. With those fields empty,
   the switch happens at once.
4. **Successor note.** When the property already has a block, the Add form shows a note above
   its fields: "A new block replaces the current one from its start date (refix or
   refinance). The app models one active loan per property." A **Learn more** link opens the
   Guide at the Fixation glossary entry.
5. Calc, the instalment hints and the validation messages are unchanged.
6. All new text is translated in en, cs and ru.

### Considered and deferred

- **Row editor for draws.** A date + amount row editor would replace the draws text area. It
  is a follow-up idea and not part of this decision.
- **Several development loans per property.** This remains a known limitation (DR-124).

## Consequences

User-visible UI change under ADR 0001. No computed number, parity target, engine output or
stored data changes. The record form gains two generic hooks, a header slot and a list of
hidden fields, which the other entity forms do not use.
