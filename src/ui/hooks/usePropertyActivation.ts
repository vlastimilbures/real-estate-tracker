// Activate and Deactivate on Property detail (#484). The two keep their own outcome rules:
// a failed Activate shows its reason in the inactive banner, a failed Deactivate stays in
// its confirm row, which shows the reason and focuses Cancel (UX-050, ADR 0248, 0261 §2).
import { useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { describeWriteError } from "../model/writeError";
import { pressed, useBusyFocus } from "./useBusyFocus";
import { useT } from "./useT";

/** The activation state of the property `id` (the page's, once it shows one). */
export function usePropertyActivation(id: string) {
  const t = useT();
  const setPropertyActive = usePortfolioStore((s) => s.setPropertyActive);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  // Activate gets focus back after any outcome; a success leaves the same button, now
  // Deactivate (ADR 0248 §2–§3).
  const [toggling, setToggling] = useBusyFocus(pressed);
  const [activeError, setActiveError] = useState<string | null>(null);

  async function activate() {
    setToggling(true);
    setActiveError(null);
    const result = await setPropertyActive(id, true);
    setToggling(false);
    if (!result.ok) setActiveError(describeWriteError(t, result.error).message);
  }

  /** Returns the result to the confirm row: on failure the confirm stays open and says
   *  why (UX-050). */
  async function deactivate() {
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
