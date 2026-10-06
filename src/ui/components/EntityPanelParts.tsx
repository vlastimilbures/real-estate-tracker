// Sub-components pulled out of EntityPanel.tsx to shrink its render tree. Presentation
// only; ConfirmRow keeps its own busy and error state.
import { useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button, TableWrap } from "./primitives";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import type { MutationResult } from "../../state/portfolioStore";

export function EntityTable<T extends { id: string }>({
  label,
  rows,
  columns,
  onDelete,
  onEdit,
  onConfirmDelete,
}: {
  /** Names the scrolling region for screen readers (the panel title). */
  label: string;
  rows: T[];
  columns: { head: string; cell: (r: T) => ReactNode; left?: boolean }[];
  onDelete?: ((id: string) => Promise<unknown>) | undefined;
  onEdit: (id: string) => void;
  onConfirmDelete: (id: string) => void;
}) {
  const tr = useT();
  return (
    <TableWrap label={label}>
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.head} scope="col" className={c.left ? "left" : ""}>
                {c.head}
              </th>
            ))}
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                className="left"
                colSpan={columns.length + 1}
                style={{ color: "var(--ink-faint)" }}
              >
                {tr.common.noneYet}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              {columns.map((c) => (
                <td key={c.head} className={c.left ? "left" : ""}>
                  {c.cell(r)}
                </td>
              ))}
              <td style={{ whiteSpace: "nowrap" }}>
                <span className="row-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Pencil}
                    onClick={() => onEdit(r.id)}
                  >
                    {tr.common.edit}
                  </Button>
                  {onDelete && (
                    <Button
                      size="sm"
                      variant="danger"
                      icon={Trash2}
                      onClick={() => onConfirmDelete(r.id)}
                    >
                      {tr.common.delete}
                    </Button>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

/** The one inline confirm for a destructive action (ADR 0143). It runs `onConfirm` and
 *  stays open with the reason when the write fails (UX-050); the caller closes it on
 *  success. */
export function ConfirmRow({
  message,
  confirmLabel,
  busyLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  busyLabel: string;
  onConfirm: () => Promise<MutationResult>;
  onCancel: () => void;
}) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="confirm-row">
      <div className="confirm-row-content">
        <span className="confirm-msg">{message}</span>
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await onConfirm();
            if (result.ok) return;
            setBusy(false);
            setError(describeWriteError(tr, result.error).message);
          }}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
        <Button size="sm" disabled={busy} onClick={onCancel}>
          {tr.common.cancel}
        </Button>
        {error && (
          <span className="error-text" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
