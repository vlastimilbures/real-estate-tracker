import { useId } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore, type OutcomeAction } from "../../state/uiStore";
import { Button } from "../components/Button";
import { Panel } from "../components/layout";
import { type FailureSite } from "../../state/diagnostics";
import { toActionError } from "../../state/actionError";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { fmtDate } from "../../lib/format";
import { useToast } from "../hooks/useToast";
import { ClearSampleButton } from "../components/ClearSampleDialog";
import { backupRecency, type BackupAgo } from "../model/backupRecency";
import { RestoreConfirm } from "../components/RestoreConfirm";
import { logBackupFailure } from "../components/restoreFailure";
import { useRestoreFlow, useRevealDataFolder } from "../hooks/useRestoreFlow";
import {
  KEEP,
  pressed,
  useBusyFocus,
  type BusyFocusTarget,
} from "../hooks/useBusyFocus";

const CHOOSE_FILE = "backup-choose-file";
const SAMPLE_HEADING = "backup-sample-title";

/** After a successful restore, which closes its confirm: Choose file (ADR 0248 §3). A
 *  failed one leaves the confirm, which puts focus on its Cancel itself (§1). */
const afterRestore: BusyFocusTarget = () =>
  document.getElementById(CHOOSE_FILE) ?? KEEP;

/** Load sample after a failure; the sample panel's heading once the sample replaced the
 *  button's panel (ADR 0248 §2–§3). */
const afterLoadSample: BusyFocusTarget = (el) =>
  el.isConnected ? el : document.getElementById(SAMPLE_HEADING);

function agoText(t: Dictionary, ago: BackupAgo): string {
  switch (ago.unit) {
    case "today":
      return t.backup.agoToday;
    case "days":
      return t.backup.agoDays(ago.n);
    case "weeks":
      return t.backup.agoWeeks(ago.n);
    case "months":
      return t.backup.agoMonths(ago.n);
  }
}

/** When the last backup was exported, and where to keep it (ADR 0110). */
function LastBackup() {
  const t = useT();
  const backup = usePortfolioStore((s) => s.backup);
  const { day, ago } = backupRecency(backup, new Date());
  return (
    <div className="mb-s4">
      <p>
        {day && ago
          ? t.backup.lastBackup(fmtDate(day), agoText(t, ago))
          : t.backup.noBackupYet}
      </p>
      <p className="text-soft fs-13">{t.backup.offDevice}</p>
    </div>
  );
}

/** Backup/restore body without a PageFrame — embedded in the Settings page sub-tabs. */
export function BackupRestorePanel() {
  const t = useT();
  const exportBackup = usePortfolioStore((s) => s.exportBackup);
  const restoreBackup = usePortfolioStore((s) => s.restoreBackup);
  const sampleActive = usePortfolioStore((s) => s.sample.active);
  const loadSample = usePortfolioStore((s) => s.loadSample);
  const empty = usePortfolioStore((s) => s.portfolio?.properties.length === 0);

  const [exporting, setExporting] = useBusyFocus(pressed);
  const [loadingSample, setLoadingSample] = useBusyFocus(afterLoadSample);
  const restoreBusy = useBusyFocus(afterRestore);
  const { showToast } = useToast();
  const folderHintId = useId();
  const setNotice = useUiStore((s) => s.setNotice);
  const setFailure = useUiStore((s) => s.setFailure);
  const dismissFailure = useUiStore((s) => s.dismissFailure);

  /** Report a failure in the notice, which follows the owner to any page; a refused
   *  backup keeps its records there, anything else is logged under `site` (ADR 0154).
   *  The store's actions log their own failures. */
  function fail(e: unknown, site: FailureSite, action: OutcomeAction) {
    logBackupFailure(site, e);
    setFailure(action, toActionError(e));
  }

  const restore = useRestoreFlow({
    busy: restoreBusy,
    clearFailure: dismissFailure,
    pickFailed: (e) => fail(e, "RESTORE", "pickBackup"),
    restore: restoreBackup,
    restored: ({ safetyBackup }) => {
      // The only pointer to the undo copy: a notice until dismissed (ADR 0154).
      setNotice({ kind: "restored", file: safetyBackup });
    },
    // One transaction: only a failure before the commit lands here, so the current data
    // is unchanged. A failed read-back after it succeeds, and the app stops on the error
    // screen (ADR 0228).
    restoreFailed: (error) => setFailure("restore", error),
  });
  /** Show the app folder in Finder (ADR 0153 §4); its `backups` folder holds the
   *  safety and pre-migration copies (ADR 0175). */
  const showFolder = useRevealDataFolder(dismissFailure, (e) =>
    setFailure("revealFolder", toActionError(e)),
  );
  // Whole-database work in progress, also one started before this page last opened:
  // the other actions wait for it (ADR 0154).
  const queued = usePortfolioStore((s) => s.replacing > 0);
  const replacing = restore.restoring || loadingSample || queued;

  async function handleExport() {
    setExporting(true);
    dismissFailure();
    try {
      const exported = await exportBackup();
      const outcome = exported.ok ? exported.value : null;
      // A cancelled save dialog is the user's own choice: no toast.
      if (!exported.ok) setFailure("backupExport", exported.error);
      else if (outcome?.kind === "saved")
        showToast(t.backup.savedTo(outcome.filename));
      else if (outcome?.kind === "downloaded") showToast(t.backup.downloaded);
    } finally {
      setExporting(false);
    }
  }

  /** Load the sample into the empty portfolio (ADR 0112). */
  async function handleLoadSample() {
    setLoadingSample(true);
    dismissFailure();
    try {
      const loaded = await loadSample();
      if (loaded.ok) {
        showToast(t.sample.loaded);
      } else setFailure("loadSample", loaded.error);
    } finally {
      setLoadingSample(false);
    }
  }

  return (
    <>
      <Panel title={t.backup.exportTitle} info={t.backup.exportHint}>
        <p className="muted-note">{t.backup.exportBody}</p>
        <LastBackup />
        <Button
          variant="primary"
          onClick={handleExport}
          disabled={exporting || replacing}
        >
          {exporting ? t.backup.exporting : t.backup.exportButton}
        </Button>
        <p id={folderHintId} className="muted-note mt-s4 mb-s2">
          {t.backup.folderHint}
        </p>
        <Button
          onClick={() => void showFolder()}
          aria-describedby={folderHintId}
        >
          {t.boot.showDataFolder}
        </Button>
      </Panel>

      <Panel title={t.backup.restoreTitle} hint={t.backup.restoreHint}>
        <p className="muted-note">{t.backup.restoreBody}</p>
        {!restore.pending ? (
          <Button
            id={CHOOSE_FILE}
            onClick={restore.choose}
            disabled={replacing}
          >
            {t.backup.chooseFile}
          </Button>
        ) : (
          <RestoreConfirm
            pending={restore.pending}
            restoring={restore.restoring}
            onCancel={restore.cancel}
            onConfirm={restore.confirm}
          />
        )}
      </Panel>

      {sampleActive && (
        <Panel
          title={t.sample.panelTitle}
          hint={t.sample.loadHint}
          headingId={SAMPLE_HEADING}
        >
          <p className="muted-note">{t.sample.panelBody}</p>
          <ClearSampleButton disabled={replacing} />
        </Panel>
      )}

      {empty && !sampleActive && (
        <Panel title={t.sample.panelTitle} hint={t.sample.loadHint}>
          <p className="muted-note">{t.sample.loadBody}</p>
          <Button onClick={handleLoadSample} disabled={replacing}>
            {loadingSample ? t.sample.loading : t.sample.loadAction}
          </Button>
        </Panel>
      )}
    </>
  );
}
