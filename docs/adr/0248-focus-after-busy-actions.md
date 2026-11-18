# 0248. After a busy action, focus returns to its button; a failed confirm focuses Cancel

- Status: Accepted
- Date: 2026-11-18
- Source: issue #549; owner decisions 2026-11-18 (#435 comment 6965976270) on the sites
  ADR 0246 and PR #541 left for the owner; tracking #435
- Amends: [0246](0246-focus-after-failed-save.md) §5 (the one hook now serves every busy
  button, not only form saves), [0143](0143-one-confirm-row.md) §4 (a failed confirm also
  puts focus on Cancel), [0094](0094-sample-portfolio-clear.md) (a failed Clear
  sample puts focus on Cancel), [0095](0095-assumptions-save-row.md) §4 and
  [0141](0141-form-errors-stay-in-form.md) §3 (a failed Assumptions save with nothing
  listed puts focus back on Save)
- Related: [0173](0173-record-panel-races-confirm-focus.md) §2 (focus after a successful
  confirm, unchanged), [0157](0157-accessibility-batch.md) §2 (a dialog returns focus to
  its opener, unchanged), [0096](0096-csv-import-preview.md) (the import preview and its
  overwrite confirm), [0154](0154-one-outcome-path.md) (whole-database actions and their
  notices), [0201](0201-button-roles.md) (button roles), [0220](0220-scenarios-one-panel.md)
  §3 (the preset bar), [0107](0107-property-section-nav.md) (a panel heading takes focus
  from script); issues #491, #536

## Context

A button that disables itself while its action runs drops keyboard focus: the browser's
focus fixup moves it to `<body>`, and the next Tab starts again at the top of the page.
ADR 0246 fixed that for a form's Save after a failed save. PR #541 listed the other places
that disable a focused button and left them for the owner:

- the destructive confirms: the confirm row (every record and property delete, and
  deactivate), Clear sample, and the Restore confirm on Settings → Backup and on the
  startup error screen;
- Excel export, the scenario presets, Duplicate and Delete, Import and its overwrite
  confirm, Activate on Property detail, Export backup, Restore and Load sample;
- the Assumptions Save in the Settings top bar.

Some of these buttons are gone after the action: the overwrite confirm unmounts when the
import starts, a successful import clears its files and with them the Import panel, a
successful restore closes its confirm, and a loaded sample replaces the Load sample panel.

That WKWebView applies the focus fixup like other browsers has not been checked in the
app; the HTML standard requires it.

## Decision

1. **A failed destructive confirm puts focus on Cancel.** When the write behind the
   confirm row (`common.yesDelete`, a deactivate's confirm), Clear sample
   (`sample.confirm`) or the Restore confirm (`backup.restoreNow`, `backup.restoreAnyway`)
   fails, the row or dialog stays open with the reason, as today, and focus goes to its
   Cancel (`common.cancel`), the safe choice the confirm opens on (ADR 0143). This holds
   on the startup error screen too. A successful confirm is unchanged: focus follows the
   row to its panel (ADR 0173 §2), the dialog closes and returns focus (ADR 0157 §2).
2. **A busy button gets focus back after any outcome.** Excel export
   (`xlsx.exportToExcel`, also after a cancelled save dialog), the scenario presets and
   Duplicate (`scenarios.duplicate`), Import (`importPage.importScope`,
   `importPage.importSelected`) and its overwrite confirm
   (`importPage.confirmOverwrite`, `importPage.confirmReplace`), Activate
   (`propertyDetail.activate`), Export backup (`backup.exportButton`) and Load sample
   (`sample.loadAction`): once the action ends, the control that had focus when it started
   gets it back.
3. **Where that control is gone, or still disabled, focus goes to the nearest stable
   place:**

   | After                                                            | Focus                                                         |
   | ---------------------------------------------------------------- | ------------------------------------------------------------- |
   | a successful import (from Import or its overwrite confirm)       | the report heading (`importPage.reportTitle`)                 |
   | a failed import from the overwrite confirm                       | Import                                                        |
   | a plan refused at the click (ADR 0229 §2), which disables Import | the Import panel heading (`importPage.importTitle`)           |
   | a successful restore                                             | Choose file (`backup.chooseFile`)                             |
   | a successful sample load                                         | the sample panel heading (`sample.panelTitle`)                |
   | a successful Activate                                            | the same button, now Deactivate (`propertyDetail.deactivate`) |
   | a deleted scenario                                               | the scenario list panel (ADR 0173, unchanged)                 |
   | none of the above on the page                                    | the page title (`h1`)                                         |

4. **Assumptions:** a failed save that shows only in the AppShell banner (nothing listed in
   the error summary) puts focus back on Save (`common.saveChanges`). A failure that lists
   errors still focuses the summary (ADR 0095 §4, ADR 0141 §3). A save started by Return in
   a field leaves focus in that field.
5. **Focus the user moved is left alone** (ADR 0246 §2), at every site: focus is moved only
   when it is on `<body>` or still on the control that started the action.
6. **One core hook.** `useFocusAfterBusy(busy, target)` in `src/ui/hooks/useBusyFocus.ts`
   remembers the focused control (and the panel or dialog around it) when the action
   starts. When the busy flag ends it checks the §5 guard first, and only then asks the
   site's `target` where focus goes. A target answers `KEEP` where the outcome has its
   own focus rule; an element that has left the page, or none, falls back to the page
   title (§3's last row) in the hook itself. A remembered control that no busy run
   followed (a click the form's own checks refused) is dropped. `useBusyFocus(target)` is
   the busy flag with the hook, and ADR 0246's `useSaveBusy` is built on it. The panel
   heading takes an `id` so a site can name it.
7. **No dictionary, copy, number or data changes.** Nothing new is announced: each outcome
   keeps its toast, alert or notice.

Delegated by the owner and recorded here:

- After a successful import the report heading takes focus, and the page scrolls to the
  report. That is accepted: it shows the result.
- After a successful Activate focus stays on the same button, now Deactivate.
- The confirm row's Cancel-on-failure also covers property delete and deactivate, as
  decision 1 names them.

Not changed, for the owner if wanted: after a successful Assumptions save, Save disables
because nothing is left to save, so focus falls to `<body>`; the Restore confirm's Cancel
and a successful Choose file leave focus where the browser puts it (neither is a busy
button).

## Consequences

- A keyboard user keeps their place after every busy action, and after a failed
  destructive confirm lands on its safe choice.
- No computed number, stored data, export, dictionary entry or layout changes. A focused
  element can show its focus ring in a ux-capture screen: those that may differ are
  52-import-done (the report heading takes focus and the page scrolls to it),
  82-load-sample-loaded (the sample panel heading) and the Settings backup screens. Each
  difference is listed on the PR with its #536 classification.
- WKWebView is unchecked: the app was not launched.
