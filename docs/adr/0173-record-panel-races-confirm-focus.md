# 0173. Record panel races and confirm-row focus

- Status: Accepted
- Date: 2026-10-11
- Source: issues #245, #248, #247, #280 (reviews of PR #244, PR #246 and PR #279); owner decisions
  (2026-10-11, Track 14: #245 option B, #247 both parts, #280 option B); test gaps #249;
  Track 14 PR N1
- Amends: [0143](0143-one-confirm-row.md) (the caller closes only the row it confirmed; focus
  after a successful confirm; Escape cancels — both were out of scope there),
  [0157](0157-accessibility-batch.md) (decision 2: when the opener is gone, focus falls back
  to the nearest connected element)
- Related: [0142](0142-row-switch-guard-busy-dialog.md) (row-switch guard),
  [0107](0107-property-section-nav.md) (section headings take focus)

## Context

A write in a record panel or on the Properties page takes a moment, and the rest of the panel
stays usable meanwhile (ADR 0142 keeps the other rows reachable). Four gaps followed:

1. **#245.** While a record form's save runs, the user clicks another row's Edit; the leave
   guard asks, and Discard opens that row. The first save then lands and its "close the
   form" closes the form the user just opened.
2. **#248.** The same for a delete: while a record's or a property's delete runs, the user
   opens another row's form or delete confirm; the first delete's success closes it.
3. **#247.** After a successful confirm the row unmounts and focus falls to `<body>`: the
   opener is gone (the deleted row's Delete) or replaced (Deactivate → the inactive banner).
   Escape does nothing in a confirm row.
4. **#280.** A dialog opened from the native menu while the property dropdown is open records
   the focused option as its opener. The dropdown then closes, the option leaves the page, and
   when the dialog closes focus falls to `<body>`.

## Decision

1. **A late write closes only its own row (#245 B, #248).** When a save or an add
   succeeds, the record panel closes the form only if it is still the same opened form: not
   just the same row, but the form opened for that write. A form opened meanwhile stays
   open, even the same row's edit form or the add form opened again. When a delete
   succeeds, the record panel and the Properties page close the delete confirm only if it
   still names the deleted row or property; a confirm for that same row opened again
   meanwhile closes with it, because the row is gone. Anything else opened meanwhile stays
   open. The scenario list needs no change: its Delete buttons are disabled while a
   scenario write runs, so no other confirm can open.
2. **Focus after a successful confirm (#247 part 1).** When the confirm row closes after its
   write landed, focus moves to the panel that held it: the panel's `section` takes focus
   from script only (`tabIndex=-1`). It stays unnamed: a named `section` is a region
   landmark, and a record panel's table is already a region named by the panel's title. When that panel
   is gone (the last property deleted, the page shows its empty state), focus moves to the
   page's `h1`, which also takes focus from script only. Focus moves only when it was lost
   (on `<body>` or still in the row), so a row or form opened meanwhile keeps it. The focus
   ring shows for keyboard focus only (`:focus-visible`), like the panel headings.
3. **Escape cancels a confirm row (#247 part 2).** Escape in the row takes the Cancel path:
   the row closes and focus goes back to the button that opened it. It does nothing while
   the write runs, or while a dialog or popover is open (the top-most layer owns Escape,
   ADR 0157).
4. **Dialog focus fallback (#280 B; amends ADR 0157 decision 2).** When a dialog or popover
   closes and focus is lost but its opener has left the page, focus goes to the first
   focusable element of the opener's nearest ancestor still on the page (for #280: the
   dropdown's trigger). The ancestors are recorded when the dialog opens. Elements inside
   an inert, `aria-hidden` or hidden subtree, or not rendered, are skipped. The walk stops
   below the app root: when no ancestor below it is left, focus stays where it fell, as
   before, rather than jumping to the page's first focusable (the skip link).
5. **Tests (#249).** The existing ConfirmRow behaviour is pinned on every caller: the
   Properties delete, Cancel restoring focus for the scenario and deactivate confirms, the
   leave-guard path, and the busy state.

## Consequences

- A slow write can no longer close a form or confirm the user opened after it started.
- Keyboard and screen-reader users keep their place after a delete or deactivate, and can
  leave a confirm row with Escape.
- Visual change: a panel focused from the keyboard after a confirm shows the focus ring.
  No new or changed text.
- No engine, parity, golden-master, stored-data or export change.
