import { useUiStore } from "../../state/uiStore";

/** Show a short confirmation in the app shell's toast region. One duration for every
 *  page (TOAST_MS); a newer toast restarts the timer, and a page change keeps it
 *  (DR-058, ADR 0154). */
export function useToast() {
  return { showToast: useUiStore((s) => s.showToast) };
}
