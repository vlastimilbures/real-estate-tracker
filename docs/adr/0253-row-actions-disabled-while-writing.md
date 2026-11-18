# 0253. Row actions are disabled while a write runs

- Status: Accepted
- Date: 2026-11-18
- Source: issue #444 (code review 2026-11, "Small ones to decide here", item 2); owner
  decision 2026-11-18 (#435 comment 6965976270); tracking #435
- Amends: [0173](0173-record-panel-races-confirm-focus.md) §1 (replaced: no late write
  can close a row opened meanwhile, because no row can open meanwhile) and §5 (the race
  tests for §1 are removed)
- Related: [0142](0142-row-switch-guard-busy-dialog.md) (the row-switch guard, unchanged),
  [0248](0248-focus-after-busy-actions.md) (focus after a busy action, unchanged),
  [0199](0199-icon-only-row-actions.md) (icon-only row actions and their disabled style),
  [0154](0154-one-outcome-path.md) (`replacing`, unchanged)

## Context

A write takes milliseconds in the app. While it runs, the record tables' Edit and Delete,
the Properties list's Edit and Delete, scenario Edit and the holding-costs pencil stay
enabled. ADR 0173 §1 handles what a second click meanwhile could cause after the fact: a
save closes its form only if it is still the same opened form, and a delete closes its
confirm only if the confirm still names the deleted row. Scenario Duplicate and Delete
were disabled by the Scenarios page's own busy flag, which a scenario form's save does
not set. Nothing in the app said "a write is running".

The edge-case review (#444) rated the race as practically never met, and the owner chose
to prevent it instead of handling it.

## Decision

1. **Write row actions are disabled while any write runs.** A `WriteRowAction` is a row
   action whose native `disabled` is its own `disabled` or "a write is running". It is
   used for:
   - Edit and Delete in the record tables (valuations, leases, loans; the generic
     record panel);
   - Edit and Delete on the Properties list;
   - scenario Edit, Duplicate and Delete;
   - the holding-costs pencil on Property detail.

   It uses the existing `.row-action:disabled` style (ADR 0199). No copy, no tooltip and
   no dictionary change. The presets, a panel's Add button, Activate and Deactivate, Add
   property and the row links (a property's name) are not row write actions and stay as
   they are.

2. **"A write is running" is a store counter, `writesRunning`.** `useWriteRunning()`
   reads `writesRunning > 0`.
   - It rises synchronously when `mutate`, `exclusive` or `replaceData` is called, so a
     write waiting in the queue counts too. A replace counts once. Every write through
     them counts, including recording an export (`recordBackup`), dismissing the sample
     banner and a restore from the startup error screen; each runs only on the owner's
     click, never at rest.
   - It falls in a `.finally` on the queued job, so it reads 0 again before the caller's
     `await` resumes. A button whose own action just ended is enabled again in the same
     commit that ends the caller's busy flag, so ADR 0248 can give it focus back
     (Duplicate).
   - Reads do not count: the CSV preview and Try again after a failed read-back wait in
     the same queue but leave it alone.
   - `replacing` (ADR 0154) is unchanged.

   The write queue moves out of the store into `src/state/writeQueue.ts`, which keeps the
   count.

3. **The ADR 0173 §1 guards are removed.** A successful save or add closes the record
   panel's form, and a successful delete closes the record panel's or the Properties
   page's confirm, without checking what is open: nothing else can have opened while the
   write ran. The eight tests that open a second row while a write runs are removed with
   them, since that can no longer happen (they drive a stubbed write, which never
   disables the buttons):
   - `EntityPanel.test.tsx`, "EntityPanel: a late write closes only its own row": the six
     tests of a save, add or delete landing after another form or confirm opened;
   - `Properties.test.tsx`: "keeps the confirm for another property opened while the
     first delete ran";
   - `ConfirmRow.test.tsx`: "a delete that lands after another row's confirm opened leaves
     focus there".

   The two tests of a deleted row's confirm opened again meanwhile (`EntityPanel.test.tsx`,
   `Properties.test.tsx`) still pass with a plain close and stay unchanged. The lost-focus
   check that the `ConfirmRow.test.tsx` test covered keeps a test of its own in
   `ConfirmRowLostFocusGuard.test.tsx`: focus moved outside the panel while the delete ran
   stays there.

4. **Kept unchanged:** the confirm row's focus handling after a successful or failed
   confirm (ADR 0173 §2, ADR 0248 §1), including its lost-focus check; the leave guard
   (ADR 0142); Cancel and Escape doing nothing while the confirm's write runs; the Scenarios
   page's own busy flag on the presets, Duplicate and Delete, as before. Duplicate and
   Delete are `WriteRowAction`s too, so either condition disables them; ADR 0248's
   Duplicate focus tests stub the store write and rely on the busy flag.
5. **Focus.** A row action pressed for a write it starts (Duplicate) loses focus to
   `<body>` while it is disabled, and gets it back once the write ends (ADR 0248 §2). A row
   action that only opens something (Edit, Delete) is disabled only while another write
   runs; a keyboard user resting on it then loses focus to `<body>`, as with any other
   button disabled under focus.

Delegated by the owner (2026-11-18) and recorded here: the eight tests removed, the two
still-passing ones kept, the new lost-focus test, the Scenarios busy flag kept beside the
counter, and every write through the three entry points counted.

Parked, for the owner if wanted:

- When a second write is still queued as the first ends, the first's button is still
  disabled when its busy flag ends, so focus stays on the page body.
- `aria-disabled` (focusable, announced as unavailable) instead of native `disabled`.
- Disabling the non-row controls too: the presets, Activate and Deactivate, a panel's Add
  button.

## Consequences

- A second row cannot be opened while a write runs, so no late write closes it; about 20
  lines of guard code and their race tests go.
- No computed number, stored data, export, dictionary entry or layout changes. A disabled
  row action looks dimmed for the milliseconds a write takes; ux-capture screens are not
  expected to differ, since none is captured while a write runs.
