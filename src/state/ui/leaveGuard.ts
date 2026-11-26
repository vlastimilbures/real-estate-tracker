// The leave guard: which open forms hold unsaved edits, and the navigation or action held
// back until the user discards them or keeps editing (ADR 0142).
import type { SliceCtx, UiState } from "./types";

export interface LeaveGuardSlice {
  /** Some open form holds unsaved edits: `unsavedSources` is not empty. */
  unsavedChanges: boolean;
  /** The open forms holding unsaved edits, one key per form, so a clean form never
   *  clears another form's flag. */
  unsavedSources: readonly string[];
  /** A navigation held back by `unsavedChanges`, waiting for Discard / Keep editing. */
  pendingLeave: (() => void) | null;
  /** The form whose edits `pendingLeave` drops, when it came from `guardedAction`; null
   *  for a navigation, which drops every form's edits. */
  pendingSource: string | null;
  /** Mark the form `source` as holding unsaved edits, or as clean. */
  setUnsavedChanges: (source: string, unsaved: boolean) => void;
  /** Run `fn` now, or, while the form `source` holds unsaved edits, hold it back for the
   *  leave guard like a navigation (a row switch in a record panel, ADR 0142). */
  guardedAction: (source: string, fn: () => void) => void;
  /** Discard the unsaved edits and carry out the held navigation. */
  confirmLeave: () => void;
  /** Keep editing: drop the held navigation. */
  cancelLeave: () => void;
}

/** Navigation that leaves the current screen or Settings tab: held back while a form
 *  has unsaved edits; staying where you are never asks. */
export function guarded(
  get: () => UiState,
  set: (s: Partial<UiState>) => void,
  target: Partial<UiState>,
) {
  const s = get();
  const moves = (Object.keys(target) as (keyof UiState)[]).some(
    (k) => s[k] !== target[k],
  );
  if (s.unsavedChanges && moves)
    set({ pendingLeave: () => set(target), pendingSource: null });
  else set(target);
}

export function leaveGuardSlice({ set, get }: SliceCtx): LeaveGuardSlice {
  return {
    unsavedChanges: false,
    unsavedSources: [],
    pendingLeave: null,
    pendingSource: null,
    setUnsavedChanges: (source, unsaved) => {
      const others = get().unsavedSources.filter((k) => k !== source);
      const unsavedSources = unsaved ? [...others, source] : others;
      set({ unsavedSources, unsavedChanges: unsavedSources.length > 0 });
    },
    guardedAction: (source, fn) => {
      if (get().unsavedSources.includes(source))
        set({ pendingLeave: fn, pendingSource: source });
      else fn();
    },
    confirmLeave: () => {
      const { pendingLeave: go, pendingSource: source, unsavedSources } = get();
      // A guarded action drops only its own form's edits; the other forms stay open with
      // theirs (ADR 0142). A navigation leaves them all.
      const kept = source ? unsavedSources.filter((k) => k !== source) : [];
      set({
        unsavedChanges: kept.length > 0,
        unsavedSources: kept,
        pendingLeave: null,
        pendingSource: null,
      });
      go?.();
    },
    cancelLeave: () => set({ pendingLeave: null, pendingSource: null }),
  };
}
