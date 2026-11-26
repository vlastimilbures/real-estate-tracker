// Feedback (ADR 0154): the toast, the notice naming a safety copy, the last failed
// action, and the sidebar backup hint.
import type { ActionError } from "../actionError";
import { guarded } from "./leaveGuard";
import type { SliceCtx } from "./types";

/** How long a toast stays: one duration for every page (ADR 0154). */
export const TOAST_MS = 4000;

/** A whole-database action, or an export, whose failure is reported (ADR 0154). */
export type OutcomeAction =
  | "restore"
  | "pickBackup"
  | "backupExport"
  | "loadSample"
  | "import"
  | "xlsxExport"
  // Show data folder in Settings → Backup (ADR 0175).
  | "revealFolder";

/** The safety copy a restore or Clear sample wrote: the owner's undo file, named on
 *  every page until dismissed (ADR 0154). */
export type Notice =
  { kind: "restored"; file: string } | { kind: "sampleCleared"; file: string };

/** A failed action, shown on every page until dismissed or the next action starts. Its
 *  own slot, so a failure never hides the safety copy's name (ADR 0154). Data, not
 *  text: it is translated when it renders. */
export interface Failure {
  action: OutcomeAction;
  error: ActionError;
}

export interface FeedbackSlice {
  /** A short confirmation, cleared after TOAST_MS. `id` tells a repeat apart. */
  toast: { message: string; id: number } | null;
  /** Show `message` as the toast; a newer one replaces it and restarts the timer. */
  showToast: (message: string) => void;
  /** The last safety copy, until dismissed (ADR 0154). In-memory only. */
  notice: Notice | null;
  setNotice: (notice: Notice) => void;
  dismissNotice: () => void;
  /** The last failed action, until dismissed or the next action starts. In-memory. */
  failure: Failure | null;
  setFailure: (action: OutcomeAction, error: ActionError) => void;
  dismissFailure: () => void;
  /** The data was replaced (restore, Clear sample, Load sample): drop the notice, the
   *  failure and the import report, which describe the old data (ADR 0154). */
  dataReplaced: () => void;
  /** The sample was cleared: name the safety backup in the notice (ADR 0094) and open
   *  the Dashboard. */
  showSampleCleared: (safetyBackup: string) => void;
  /** The sidebar backup reminder was hidden for this session (ADR 0110). In-memory. */
  backupHintDismissed: boolean;
  dismissBackupHint: () => void;
}

/** The pending toast dismissal; a newer toast restarts it. */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

export function feedbackSlice({ set, get }: SliceCtx): FeedbackSlice {
  return {
    toast: null,
    showToast: (message) => {
      clearTimeout(toastTimer);
      const id = ++toastSeq;
      set({ toast: { message, id } });
      // Only its own toast: a store reset (tests) may have set another since.
      toastTimer = setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, TOAST_MS);
    },
    notice: null,
    setNotice: (notice) => set({ notice }),
    dismissNotice: () => set({ notice: null }),
    failure: null,
    setFailure: (action, error) => set({ failure: { action, error } }),
    dismissFailure: () => set({ failure: null }),
    dataReplaced: () => set({ notice: null, failure: null, lastImport: null }),
    showSampleCleared: (safetyBackup) => {
      set({ notice: { kind: "sampleCleared", file: safetyBackup } });
      guarded(get, set, { route: "dashboard" });
    },
    backupHintDismissed: false,
    dismissBackupHint: () => set({ backupHintDismissed: true }),
  };
}
