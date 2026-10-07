import { useId, useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { SafetyBackupError } from "../../state/backup";
import { logFailure } from "../../state/diagnostics";
import { toWriteError } from "../../state/writeError";
import { describeWriteError } from "../model/writeError";
import { useT } from "../hooks/useT";
import { Button } from "./primitives";
import { Modal } from "./Modal";

/** "Clear sample" confirmation (ADR 0094): says what is deleted and kept, then clears
 *  the sample after a safety backup and opens the Dashboard, which names the backup. */
function ClearSampleDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const titleId = useId();
  const clearSample = usePortfolioStore((s) => s.clearSample);
  const showSampleCleared = useUiStore((s) => s.showSampleCleared);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setClearing(true);
    setError(null);
    try {
      const { safetyBackup } = await clearSample();
      onClose();
      showSampleCleared(safetyBackup);
    } catch (e) {
      // One transaction after a verified backup: only a failure before the commit lands
      // here, so the data is unchanged. A failed reload after it resolves (ADR 0125).
      logFailure("SAMPLE", e);
      setError(
        e instanceof SafetyBackupError
          ? t.sample.safetyBackupFailed(e.detail)
          : t.sample.clearFailed(
              describeWriteError(t, toWriteError(e)).message,
            ),
      );
      setClearing(false);
    }
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
          <Button onClick={onClose} disabled={clearing}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={clearing}>
            {clearing ? t.sample.clearing : t.sample.confirm}
          </Button>
        </>
      }
    >
      <p>{t.sample.dialogDeletes}</p>
      <p style={{ marginTop: "var(--s3)" }}>{t.sample.dialogKeeps}</p>
      <p style={{ marginTop: "var(--s3)", color: "var(--ink-soft)" }}>
        {t.sample.dialogBackup}
      </p>
      {error && (
        <p
          className="error-text"
          role="alert"
          style={{ marginTop: "var(--s3)" }}
        >
          {error}
        </p>
      )}
    </Modal>
  );
}

/** The "Clear sample and start my own" button with its confirmation dialog. */
export function ClearSampleButton({
  variant,
}: {
  variant?: "primary" | undefined;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {t.sample.clearAction}
      </Button>
      {open && <ClearSampleDialog onClose={() => setOpen(false)} />}
    </>
  );
}
