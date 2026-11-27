// The panel action that exports a table to .xlsx and reports the outcome. The one
// shared control that reaches the stores: a toast for a saved file, a failure notice.
import { FileSpreadsheet } from "lucide-react";
import { useT } from "../hooks/useT";
import { useToast } from "../hooks/useToast";
import { useUiStore } from "../../state/uiStore";
import { pressed, useBusyFocus } from "../hooks/useBusyFocus";
import { logFailure } from "../../state/diagnostics";
import type { SaveOutcome } from "../../state/platform";
import { toSaveFailed } from "../../state/actionError";
import { Button } from "./Button";

/**
 * Icon button for a Panel `action` slot that exports the panel's table to .xlsx.
 * Disables while writing, then shows a toast naming the saved file, nothing for a
 * cancelled dialog (the user's own choice), or a notice with the reason, which stays
 * until dismissed (ADR 0154).
 */
export function ExportXlsxButton({
  onExport,
  label,
}: {
  /** Resolves to what happened to the file (see saveFile). */
  onExport: () => Promise<SaveOutcome>;
  label?: string | undefined;
}) {
  const t = useT();
  const btnLabel = label ?? t.xlsx.exportToExcel;
  // Focus goes back to the button after any outcome (ADR 0248 §2).
  const [busy, setBusy] = useBusyFocus(pressed);
  const { showToast } = useToast();
  const setFailure = useUiStore((s) => s.setFailure);

  const run = async () => {
    setBusy(true);
    try {
      const outcome = await onExport();
      if (outcome.kind !== "cancelled")
        showToast(t.xlsx.exported(outcome.filename));
    } catch (e) {
      logFailure("EXPORT", e);
      // A failed save's OS text, else the error's own message (ADR 0193), with its
      // Rust code (ADR 0271).
      setFailure("xlsxExport", toSaveFailed(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Visible text, which is also the accessible name (ADR 0111). */}
      <Button
        size="sm"
        icon={FileSpreadsheet}
        onClick={() => void run()}
        disabled={busy}
        aria-busy={busy}
      >
        {btnLabel}
      </Button>
    </>
  );
}
