// The confirm step of a restore: what the chosen backup holds, its out-of-range values,
// and Cancel / Restore. Shared by Settings → Backup and the startup error screen.
import { Fragment, useId } from "react";
import { Button } from "./Button";
import { TableWrap } from "./layout";
import {
  SCHEMA_HEAD,
  type BackupSummary,
  type PickedBackup,
  type RestoreIssue,
} from "../../state/backup";
import { useT } from "../hooks/useT";
import { restoreIssueText } from "../model/restoreIssue";
import { fmtDate, EMPTY } from "../../lib/format";
import { exportedDay } from "../model/backupRecency";
import { useFocusAfterBusy } from "../hooks/useBusyFocus";

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
      className="mt-s3"
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
                {i.id !== undefined ? <code>{i.id}</code> : EMPTY}
              </td>
              <td className="left">
                {i.column ? <code>{i.column}</code> : EMPTY}
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
  const exported = exportedDay(summary.exportedAt);
  return (
    <div className="mb-s4">
      {exported && <p>{b.backupDate(fmtDate(exported))}</p>}
      {summary.schemaVersion < SCHEMA_HEAD && (
        <p className="restore-older">{b.olderVersion}</p>
      )}
      <p className="restore-holds">{b.holds}</p>
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
  const cancelId = useId();
  // A failed restore puts focus on Cancel (ADR 0248 §1); a successful one closes the
  // confirm and the caller places focus.
  const remember = useFocusAfterBusy(restoring, () =>
    document.getElementById(cancelId),
  );
  return (
    <div className="restore-confirm">
      <p className="restore-gap">{t.backup.restoreFrom(pending.file)}</p>
      <Summary summary={pending.summary} />
      {pending.warnings.length > 0 && (
        <div className="mb-s4">
          <p>{t.backup.warnOutOfRange(pending.warnings.length)}</p>
          <IssueTable issues={pending.warnings} warning />
        </div>
      )}
      <p className="error-text restore-gap">{t.backup.restoreWarning}</p>
      <div className="row row-s3">
        <Button id={cancelId} onClick={onCancel} disabled={restoring}>
          {t.common.cancel}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            remember();
            onConfirm();
          }}
          disabled={restoring}
        >
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
