// Activate and Deactivate on Property detail (#484). The two keep their own outcome rules:
// a failed Activate shows its reason in the inactive banner, a failed Deactivate stays in
// its confirm row, which shows the reason and focuses Cancel (UX-050, ADR 0248, 0261 §2).
import { useState } from "react";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../state/portfolioStore";
import { describeWriteError } from "../model/writeError";
import { pressed, useBusyFocus } from "./useBusyFocus";
import { useT } from "./useT";

/** The activation state of the page's property `id`; null while it shows none. Activate
 *  and Deactivate render only for a shown property, so they always run with an id. */
export function usePropertyActivation(id: string | null) {
  const t = useT();
  const setPropertyActive = usePortfolioStore((s) => s.setPropertyActive);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  // Activate gets focus back after any outcome; a success leaves the same button, now
  // Deactivate (ADR 0248 §2–§3).
  const [toggling, setToggling] = useBusyFocus(pressed);
  const [activeError, setActiveError] = useState<string | null>(null);

  async function activate() {
    if (id === null) return;
    setToggling(true);
    setActiveError(null);
    const result = await setPropertyActive(id, true);
    setToggling(false);
    if (!result.ok) setActiveError(describeWriteError(t, result.error).message);
  }

  /** Returns the result to the confirm row: on failure the confirm stays open and says
   *  why (UX-050). */
  async function deactivate(): Promise<MutationResult> {
    // No property shown, nothing to deactivate (unreachable: see above).
    if (id === null) return { ok: true };
    const result = await setPropertyActive(id, false);
    if (result.ok) setConfirmingDeactivate(false);
    return result;
  }

  return {
    confirmingDeactivate,
    setConfirmingDeactivate,
    toggling,
    activeError,
    activate,
    deactivate,
  };
}
