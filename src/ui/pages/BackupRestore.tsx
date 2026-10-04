import { Fragment, useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { Panel, Button, Toast, TableWrap } from "../components/primitives";
import {
  BackupExportError,
  chooseRestoreFile,
  RestoreError,
  SafetyBackupError,
  SampleNotEmptyError,
  SCHEMA_HEAD,
  type BackupFile,
  type BackupSummary,
  type RestoreIssue,
} from "../../state/backup";
import { logFailure } from "../../state/diagnostics";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import { restoreIssueText } from "../model/restoreIssue";
import { toWriteError } from "../../state/writeError";
import { fmtDate } from "../../lib/format";
import { useToast } from "../hooks/useToast";
import { ClearSampleButton } from "../components/ClearSampleDialog";
import { backupRecency, type BackupAgo } from "../model/backupRecency";

/** A refused backup as a translated message; `issues` are listed separately. */
function restoreErrorText(t: Dictionary, e: RestoreError): string {
  const b = t.backup;
  switch (e.code) {
    case "BACKUP_TOO_LARGE":
      return b.errTooLarge(20);
    case "BACKUP_NOT_JSON":
      return b.errNotJson;
    case "BACKUP_INVALID":
      return b.errInvalid(e.detail);
    case "BACKUP_NEWER":
      return b.errNewer(e.detail);
    case "BACKUP_ROWS_INVALID":
      return b.errRowsInvalid;
  }
}

function IssueTable({ issues }: { issues: RestoreIssue[] }) {
  const t = useT();
  const b = t.backup;
  return (
    <TableWrap label={t.backup.errorTitle} style={{ marginTop: "var(--s3)" }}>
      <table className="data">
        <thead>
          <tr>
            <th className="left">{b.colTable}</th>
            <th className="left">{b.colRecord}</th>
            <th className="left">{b.colColumn}</th>
            <th className="left">{b.colProblem}</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((i, n) => (
            <tr key={n}>
              <td className="left">
                <code>{i.table}</code>
              </td>
              <td className="left">
                {i.id !== undefined ? <code>{i.id}</code> : "—"}
              </td>
              <td className="left">
                {i.column ? <code>{i.column}</code> : "—"}
              </td>
              <td className="left" style={{ color: "var(--negative)" }}>
                {restoreIssueText(t, i)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Summary({ summary }: { summary: BackupSummary }) {
  const t = useT();
  const b = t.backup;
  const exported = new Date(summary.exportedAt);
  return (
    <div style={{ marginBottom: "var(--s4)" }}>
      {!Number.isNaN(exported.getTime()) && (
        <p>{b.backupDate(fmtDate(exported))}</p>
      )}
      {summary.schemaVersion < SCHEMA_HEAD && (
        <p style={{ color: "var(--ink-soft)" }}>{b.olderVersion}</p>
      )}
      <p style={{ marginTop: "var(--s2)" }}>{b.holds}</p>
      <div className="statlist">
        {Object.entries(summary.counts).map(([table, n]) => (
          <Fragment key={table}>
            <div className="k">{b.tables[table as keyof typeof b.tables]}</div>
            <div className="v num">{n}</div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

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
  const [pendingBackup, setPendingBackup] = useState<{
    file: string;
    backup: BackupFile;
    summary: BackupSummary;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<RestoreIssue[]>([]);

  /** Show a failure: a refused backup with its records, anything else translated. */
  function fail(e: unknown, other: (detail: string) => string) {
    if (e instanceof RestoreError) {
      setError(restoreErrorText(t, e));
      setIssues(e.issues);
      return;
    }
    if (e instanceof SampleNotEmptyError) {
      setError(t.sample.errNotEmpty);
      return;
    }
    logFailure("BACKUP", e);
    setError(
      e instanceof SafetyBackupError
        ? t.backup.safetyBackupFailed(e.detail)
        : e instanceof BackupExportError
          ? t.backup.exportFailed(e.detail)
          : other(describeWriteError(t, toWriteError(e)).message),
    );
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
      fail(e, t.backup.exportFailed);
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
      fail(e, t.sample.loadFailed);
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
      fail(e, t.backup.errInvalid);
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
      fail(e, t.backup.restoreFailed);
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
          <div>
            <p style={{ marginBottom: "var(--s4)" }}>
              {t.backup.restoreFrom(pendingBackup.file)}
            </p>
            <Summary summary={pendingBackup.summary} />
            <p className="error-text" style={{ marginBottom: "var(--s4)" }}>
              {t.backup.restoreWarning}
            </p>
            <div className="row" style={{ gap: "var(--s3)" }}>
              <Button
                onClick={() => setPendingBackup(null)}
                disabled={restoring}
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmRestore}
                disabled={restoring}
              >
                {restoring ? t.backup.restoring : t.backup.restoreNow}
              </Button>
            </div>
          </div>
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
