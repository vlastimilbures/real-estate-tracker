import { useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { Panel, Button, Toast } from "../components/primitives";
import {
  chooseRestoreFile,
  type PickedBackup,
  type RestoreIssue,
} from "../../state/backup";
import { type FailureSite } from "../../state/diagnostics";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { fmtDate } from "../../lib/format";
import { useToast } from "../hooks/useToast";
import { ClearSampleButton } from "../components/ClearSampleDialog";
import { backupRecency, type BackupAgo } from "../model/backupRecency";
import { IssueTable, RestoreConfirm } from "../components/RestoreConfirm";
import { backupFailure } from "../components/restoreFailure";

function agoText(t: Dictionary, ago: BackupAgo): string {
  switch (ago.unit) {
    case "today":
      return t.backup.agoToday;
    case "days":
      return t.backup.agoDays(ago.n);
    case "weeks":
      return t.backup.agoWeeks(ago.n);
  }
}

/** When the last backup was exported, and where to keep it (ADR 0110). */
function LastBackup() {
  const t = useT();
  const backup = usePortfolioStore((s) => s.backup);
  const { day, ago } = backupRecency(backup, new Date());
  return (
    <div style={{ marginBottom: "var(--s4)" }}>
      <p>
        {day && ago
          ? t.backup.lastBackup(fmtDate(day), agoText(t, ago))
          : t.backup.noBackupYet}
      </p>
      <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
        {t.backup.offDevice}
      </p>
    </div>
  );
}

/** Backup/restore body without an AppShell — embedded in the Settings page sub-tabs. */
export function BackupRestorePanel() {
  const t = useT();
  const exportBackup = usePortfolioStore((s) => s.exportBackup);
  const restoreBackup = usePortfolioStore((s) => s.restoreBackup);
  const sampleActive = usePortfolioStore((s) => s.sample.active);
  const loadSample = usePortfolioStore((s) => s.loadSample);
  const empty = usePortfolioStore((s) => s.portfolio?.properties.length === 0);

  const [exporting, setExporting] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<PickedBackup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<RestoreIssue[]>([]);

  /** Show a failure: a refused backup with its records, anything else translated and
   *  logged under `site`. */
  function fail(
    e: unknown,
    site: FailureSite,
    other: (detail: string) => string,
  ) {
    const { text, issues } = backupFailure(t, e, site, other);
    setError(text);
    setIssues(issues);
  }

  function clearError() {
    setError(null);
    setIssues([]);
  }
  const { toast, showToast } = useToast(2400);

  async function handleExport() {
    setExporting(true);
    clearError();
    try {
      const outcome = await exportBackup();
      // A cancelled save dialog is the user's own choice: no toast (UX-001).
      if (outcome.kind === "saved")
        showToast(t.backup.savedTo(outcome.filename));
      else if (outcome.kind === "downloaded") showToast(t.backup.downloaded);
    } catch (e) {
      fail(e, "BACKUP", t.backup.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  /** Load the sample into the empty portfolio (ADR 0112). */
  async function handleLoadSample() {
    setLoadingSample(true);
    clearError();
    try {
      await loadSample();
      showToast(t.sample.loaded);
    } catch (e) {
      fail(e, "SAMPLE", t.sample.loadFailed);
    } finally {
      setLoadingSample(false);
    }
  }

  async function handleChooseRestore() {
    clearError();
    try {
      const picked = await chooseRestoreFile();
      if (picked) setPendingBackup(picked);
    } catch (e) {
      fail(e, "RESTORE", t.backup.errInvalid);
    }
  }

  async function handleConfirmRestore() {
    if (!pendingBackup) return;
    setRestoring(true);
    clearError();
    try {
      const { safetyBackup } = await restoreBackup(pendingBackup.backup);
      setPendingBackup(null);
      showToast(t.backup.restored(safetyBackup));
    } catch (e) {
      // One transaction: only a failure before the commit lands here, so the current
      // data is unchanged (DR-019). A failed reload after it resolves (ADR 0125).
      fail(e, "RESTORE", t.backup.restoreFailed);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <Panel title={t.backup.exportTitle} hint={t.backup.exportHint}>
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: 13,
            marginBottom: "var(--s4)",
          }}
        >
          {t.backup.exportBody}
        </p>
        <LastBackup />
        <Button variant="primary" onClick={handleExport} disabled={exporting}>
          {exporting ? t.backup.exporting : t.backup.exportButton}
        </Button>
      </Panel>

      <Panel title={t.backup.restoreTitle} hint={t.backup.restoreHint}>
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: 13,
            marginBottom: "var(--s4)",
          }}
        >
          {t.backup.restoreBody}
        </p>
        {!pendingBackup ? (
          <Button onClick={handleChooseRestore} disabled={restoring}>
            {t.backup.chooseFile}
          </Button>
        ) : (
          <RestoreConfirm
            pending={pendingBackup}
            restoring={restoring}
            onCancel={() => setPendingBackup(null)}
            onConfirm={handleConfirmRestore}
          />
        )}
      </Panel>

      {sampleActive && (
        <Panel title={t.sample.panelTitle} hint={t.sample.loadHint}>
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 13,
              marginBottom: "var(--s4)",
            }}
          >
            {t.sample.panelBody}
          </p>
          <ClearSampleButton />
        </Panel>
      )}

      {empty && !sampleActive && (
        <Panel title={t.sample.panelTitle} hint={t.sample.loadHint}>
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 13,
              marginBottom: "var(--s4)",
            }}
          >
            {t.sample.loadBody}
          </p>
          <Button onClick={handleLoadSample} disabled={loadingSample}>
            {loadingSample ? t.sample.loading : t.sample.loadAction}
          </Button>
        </Panel>
      )}

      {error && (
        <Panel title={t.backup.errorTitle}>
          <p className="error-text">{error}</p>
          {issues.length > 0 && <IssueTable issues={issues} />}
        </Panel>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
