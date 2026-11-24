import { useId, useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { backupFailureText } from "./restoreFailure";
import { useT } from "../hooks/useT";
import { Button } from "./primitives";
import { Modal } from "./Modal";
import { useBusyFocus } from "../hooks/useBusyFocus";

/** "Clear sample" confirmation (ADR 0094): says what is deleted and kept, then clears
 *  the sample after a safety backup and opens the Dashboard, which names the backup. */
function ClearSampleDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const titleId = useId();
  const cancelId = useId();
  const clearSample = usePortfolioStore((s) => s.clearSample);
  const showSampleCleared = useUiStore((s) => s.showSampleCleared);
  const dataReplaced = useUiStore((s) => s.dataReplaced);
  // A failed clear puts focus on Cancel (ADR 0248 §1); a success closes the dialog.
  const [clearing, setClearing] = useBusyFocus(() =>
    document.getElementById(cancelId),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setClearing(true);
    setError(null);
    const cleared = await clearSample();
    if (cleared.ok) {
      onClose();
      dataReplaced();
      showSampleCleared(cleared.value.safetyBackup);
      return;
    }
    // One transaction after a verified backup: only a failure before the commit lands
    // here, so the data is unchanged; the store logged it. A failed read-back after it
    // succeeds, and the app stops on the error screen (ADR 0228).
    setError(
      backupFailureText(t, cleared.error, {
        safety: t.sample.safetyBackupFailed,
        other: t.sample.clearFailed,
      }).text,
    );
    setClearing(false);
  }

  return (
    <Modal
      titleId={titleId}
      title={t.sample.dialogTitle}
      onClose={onClose}
      closeLabel={t.common.close}
      busy={clearing}
      footer={
        <>
          <Button id={cancelId} onClick={onClose} disabled={clearing}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={clearing}>
            {clearing ? t.sample.clearing : t.sample.confirm}
          </Button>
        </>
      }
    >
      <p>{t.sample.dialogDeletes}</p>
      <p className="mt-s3">{t.sample.dialogKeeps}</p>
      <p className="mt-s3 text-soft">{t.sample.dialogBackup}</p>
      {error && (
        <p className="error-text mt-s3" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

/** The "Clear sample and start my own" button with its confirmation dialog. */
export function ClearSampleButton({
  disabled = false,
}: {
  /** Another whole-database action is running (ADR 0154). */
  disabled?: boolean | undefined;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        {t.sample.clearAction}
      </Button>
      {open && <ClearSampleDialog onClose={() => setOpen(false)} />}
    </>
  );
}
