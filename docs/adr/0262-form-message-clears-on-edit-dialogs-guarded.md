# 0262. The form-level message clears on the next edit; a dirty dialog is known to the leave guard

- Status: Accepted
- Date: 2026-11-25
- Source: issue #489 (code review 2026-11, CR-47, findings R08-05, R08-06, R07-06, tracking
  #435); draft in #489 comment 7148251776, approved by the owner on #489 on 2026-11-25
  (comment 7148870093, both changes)
- Amends: [0141](0141-form-errors-stay-in-form.md) (where the form-level message lives is
  unchanged; when it goes is new), [0142](0142-row-switch-guard-busy-dialog.md) (the leave
  guard's sources)
- Related: [0095](0095-assumptions-save-row.md) (the Assumptions form already clears it on
  an edit), [0241](0241-property-form-keeps-input.md) §4 (the leave-guard registration was
  left to #489), [0246](0246-focus-after-failed-save.md) and
  [0248](0248-focus-after-busy-actions.md) (focus, unchanged),
  [0261](0261-failed-edit-shown-once.md) (where a failure shows, unchanged),
  [0157](0157-accessibility-batch.md) (menu items held while a dialog is open), UX-029,
  UX-030

## Context

All four forms (the record forms, the property form, the scenario form and the Assumptions
form) save through one hook, `useFormSubmit`, and register unsaved edits through one hook,
`useLeaveGuard` (#489). That refactor kept two differences between the forms, because
changing them is visible.

1. **When the form-level message goes.** This is the line above the buttons, the property
   form's banner with its ✕, or an entry in the Assumptions error summary that names no
   field. It shows a failed save that names no field the form shows (ADR 0141, ADR 0261 §2).
   It went:
   - in the record forms and the scenario form, on the next Save, also one the form's own
     checks refuse; an edit left it;
   - in the property form, only when a save passed the form's checks and started, or on ✕;
     an edit, or a Save the checks refused, left it;
   - in Assumptions, on the next edit and on the next Save (ADR 0095).

   A field error already goes with the edit to its field in every form (ADR 0141). So in
   three forms the owner fixed the input and the old message still said the save failed,
   describing input that was no longer there.

2. **Which forms the leave guard knows.** The record forms and the Assumptions form register
   their unsaved edits with the store (`setUnsavedChanges`). A navigation through the guard
   then asks first (`common.unsavedTitle`, `common.unsavedBody`, `common.keepEditing`,
   `common.discardChanges`). The property and scenario dialogs only told their dialog that
   they held unsaved input, which blocks Esc and the backdrop (UX-029). They never
   registered.

   Traced on `d9f4d9b4`: the native menu items are ignored while any dialog is open
   (`src/ui/App.tsx:106-130`, ADR 0157), and the dialog's overlay covers the sidebar. No
   path found today navigates through the guard while one of these dialogs is open. The gap
   would become reachable through any later navigation that does not check for an open
   dialog (a store-driven `navigate`, a new shortcut).

## Decision

1. **The form-level message clears on the next edit in every form.** An edit to any field of
   the record forms, the property form or the scenario form removes the form-level message,
   as it already does in Assumptions. Each Save also removes it before it runs, including one
   the form's own checks refuse. The property form's ✕ stays. The message's text, its place
   (ADR 0261) and its announcement do not change. Only when it goes changes. The
   `formErrorUntil` option of `useFormSubmit` is removed.
2. **A property or scenario dialog with unsaved input is known to the leave guard.** While
   its input differs from what it opened with, the dialog registers under its own key with
   `useLeaveGuard`, as a record form does. It unregisters when it closes, saves or becomes
   clean. A navigation through the guard while it is dirty asks with the existing leave
   prompt (the keys above), and Discard drops the dialog's input with it. The dialog's own
   `dirty` still blocks Esc and the backdrop (UX-029). Cancel and ✕ still close it without
   asking.
3. **Unchanged:** the dictionary and every text (no new key), field errors and when they go
   (ADR 0141), focus after a save (ADR 0246, ADR 0248), where a failure shows (ADR 0261),
   the add and edit flows and their ids (ADR 0127), stored data and every number.

## Consequences

- After a failed save, an edit leaves only what is still true on screen: no field error on
  an edited field and no stale message about the failed save. The next Save shows any new
  failure in the same place.
- In the property form, a Save that the form's checks refuse now also removes an earlier
  form-level message, as in the other forms.
- "Unsaved" means one thing in every form: the leave guard knows every form that holds
  input. Nothing the owner can do today shows the prompt over a dialog (see Context), so
  the visible change from 2 shows only in a navigation added later.
- No ux-capture screen shows a form-level message after an edit or a leave prompt over a
  dialog, so the screens do not change.
