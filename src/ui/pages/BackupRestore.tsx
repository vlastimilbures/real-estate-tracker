import { useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore, type OutcomeAction } from "../../state/uiStore";
import { Panel, Button } from "../components/primitives";
import { chooseRestoreFile, type PickedBackup } from "../../state/backup";
import { type FailureSite } from "../../state/diagnostics";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { fmtDate } from "../../lib/format";
import { useToast } from "../hooks/useToast";
import { ClearSampleButton } from "../components/ClearSampleDialog";
import { backupRecency, type BackupAgo } from "../model/backupRecency";
import { RestoreConfirm } from "../components/RestoreConfirm";
import { logBackupFailure } from "../components/restoreFailure";

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
  const { showToast } = useToast();
  const setNotice = useUiStore((s) => s.setNotice);
  const dismissNotice = useUiStore((s) => s.dismissNotice);
  const dataReplaced = useUiStore((s) => s.dataReplaced);
  // Whole-database work in progress: the other actions wait for it (ADR 0154).
  const replacing = restoring || loadingSample;

  /** Report a failure in the notice, which follows the owner to any page; a refused
   *  backup keeps its records there, anything else is logged under `site` (ADR 0154). */
  function fail(e: unknown, site: FailureSite, action: OutcomeAction) {
    logBackupFailure(site, e);
    setNotice({ kind: "failed", action, error: e });
  }

  async function handleExport() {
    setExporting(true);
    dismissNotice();
    try {
      const outcome = await exportBackup();
      // A cancelled save dialog is the user's own choice: no toast (UX-001).
      if (outcome.kind === "saved")
        showToast(t.backup.savedTo(outcome.filename));
      else if (outcome.kind === "downloaded") showToast(t.backup.downloaded);
    } catch (e) {
      fail(e, "BACKUP", "backupExport");
    } finally {
      setExporting(false);
    }
  }

  /** Load the sample into the empty portfolio (ADR 0112). */
  async function handleLoadSample() {
    setLoadingSample(true);
    dismissNotice();
    try {
      await loadSample();
      dataReplaced();
      showToast(t.sample.loaded);
    } catch (e) {
      fail(e, "SAMPLE", "loadSample");
    } finally {
      setLoadingSample(false);
    }
  }

  async function handleChooseRestore() {
    dismissNotice();
    try {
      const picked = await chooseRestoreFile();
      if (picked) setPendingBackup(picked);
    } catch (e) {
      fail(e, "RESTORE", "pickBackup");
    }
  }

  async function handleConfirmRestore() {
    if (!pendingBackup) return;
    setRestoring(true);
    dismissNotice();
    try {
      const { safetyBackup } = await restoreBackup(pendingBackup.backup);
      setPendingBackup(null);
      // The only pointer to the undo copy: a notice until dismissed (ADR 0154).
      dataReplaced();
      setNotice({ kind: "restored", file: safetyBackup });
    } catch (e) {
      // One transaction: only a failure before the commit lands here, so the current
      // data is unchanged (DR-019). A failed reload after it resolves (ADR 0125).
      fail(e, "RESTORE", "restore");
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
        <Button
          variant="primary"
          onClick={handleExport}
          disabled={exporting || replacing}
        >
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
          <Button onClick={handleChooseRestore} disabled={replacing}>
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
          <ClearSampleButton disabled={replacing} />
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
          <Button onClick={handleLoadSample} disabled={replacing}>
            {loadingSample ? t.sample.loading : t.sample.loadAction}
          </Button>
        </Panel>
      )}
    </>
  );
}
