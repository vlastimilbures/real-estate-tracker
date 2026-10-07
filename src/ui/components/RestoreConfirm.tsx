// The confirm step of a restore: what the chosen backup holds, its out-of-range values,
// and Cancel / Restore. Shared by Settings → Backup and the startup error screen (#115).
import { Fragment } from "react";
import { Button, TableWrap } from "./primitives";
import {
  SCHEMA_HEAD,
  type BackupSummary,
  type PickedBackup,
  type RestoreIssue,
} from "../../state/backup";
import { useT } from "../hooks/useT";
import { restoreIssueText } from "../model/restoreIssue";
import { fmtDate } from "../../lib/format";
import { localDay } from "../../lib/day";

/** The records of a refused backup, or (`warning`) the out-of-range values a restore asks
 *  about (ADR 0148). */
export function IssueTable({
  issues,
  warning = false,
}: {
  issues: RestoreIssue[];
  warning?: boolean;
}) {
  const t = useT();
  const b = t.backup;
  return (
    <TableWrap
      label={warning ? b.warningsTitle : b.errorTitle}
      style={{ marginTop: "var(--s3)" }}
    >
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
              <td
                className="left"
                style={{ color: warning ? "var(--warn)" : "var(--negative)" }}
              >
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
  // The local calendar day, like the file name and "Last backup" (ADR 0149).
  const exported = new Date(summary.exportedAt);
  return (
    <div style={{ marginBottom: "var(--s4)" }}>
      {!Number.isNaN(exported.getTime()) && (
        <p>{b.backupDate(fmtDate(localDay(exported)))}</p>
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

export function RestoreConfirm({
  pending,
  restoring,
  onCancel,
  onConfirm,
}: {
  pending: PickedBackup;
  restoring: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <div>
      <p style={{ marginBottom: "var(--s4)" }}>
        {t.backup.restoreFrom(pending.file)}
      </p>
      <Summary summary={pending.summary} />
      {pending.warnings.length > 0 && (
        <div style={{ marginBottom: "var(--s4)" }}>
          <p>{t.backup.warnOutOfRange(pending.warnings.length)}</p>
          <IssueTable issues={pending.warnings} warning />
        </div>
      )}
      <p className="error-text" style={{ marginBottom: "var(--s4)" }}>
        {t.backup.restoreWarning}
      </p>
      <div className="row" style={{ gap: "var(--s3)" }}>
        <Button onClick={onCancel} disabled={restoring}>
          {t.common.cancel}
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={restoring}>
          {restoring
            ? t.backup.restoring
            : pending.warnings.length > 0
              ? t.backup.restoreAnyway
              : t.backup.restoreNow}
        </Button>
      </div>
    </div>
  );
}
