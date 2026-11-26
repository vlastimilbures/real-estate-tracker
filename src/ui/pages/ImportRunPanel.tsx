// The Import panel: why Import is unavailable, the preview's summary, and Import with
// its overwrite confirm.
import { Panel, ErrorBanner } from "../components/layout";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import type { sessionView } from "../model/importSession";
import { ImportActions, ImportSummary, RefusedTable } from "./ImportPanels";

export function ImportRunPanel({
  view,
  importing,
  onRun,
  onCancel,
}: {
  view: ReturnType<typeof sessionView>;
  importing: boolean;
  onRun: (confirmed: boolean) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { preview, previewFailure, planOk, toWrite, counts, confirming } = view;
  return (
    <Panel title={t.importPage.importTitle}>
      {view.phase === "fileErrors" && (
        <p className="error-text mb-s3">{t.importPage.fixErrors}</p>
      )}
      {/* No dismiss: Import stays unavailable until a new preview, so the reason
          stays on screen (ADR 0175). */}
      {previewFailure && (
        <div className="mb-s3">
          <ErrorBanner
            message={t.importPage.previewFailed(
              describeWriteError(t, previewFailure).message,
            )}
          />
        </div>
      )}
      {preview && preview.problems.length > 0 && (
        <RefusedTable problems={preview.problems} />
      )}
      {planOk && preview && (
        <div className="mb-s3">
          <ImportSummary items={preview.items} mode="preview" />
          {toWrite === 0 && preview.items.length > 0 && (
            <p className="mt-s3">{t.importPage.nothingToImport}</p>
          )}
        </div>
      )}
      <ImportActions
        scope={planOk && toWrite > 0 ? toWrite : null}
        counts={counts}
        importing={importing}
        disabled={view.phase !== "ready"}
        confirming={confirming}
        onRun={onRun}
        onCancel={onCancel}
      />
    </Panel>
  );
}
