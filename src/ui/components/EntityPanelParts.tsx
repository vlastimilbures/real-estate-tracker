// Sub-components pulled out of EntityPanel.tsx to shrink its render tree. Pure
// presentation — no logic beyond what EntityPanel.tsx already computed.
import { type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button, TableWrap } from "./primitives";
import { useT } from "../hooks/useT";

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

export function DeleteConfirmRow({
  busy,
  error,
  message,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  /** Names what will be deleted; defaults to the generic "Delete this record?". */
  message?: string | undefined;
  /** Why the last attempt failed, shown next to the buttons (UX-050). */
  error?: string | null | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tr = useT();
  return (
    <div
      style={{
        padding: "var(--s4) var(--s5)",
        borderTop: "1px solid var(--hairline)",
        display: "flex",
        alignItems: "center",
        gap: "var(--s4)",
        flexWrap: "wrap",
      }}
    >
      <span style={{ color: "var(--negative)" }}>
        {message ?? tr.common.confirmDeleteRow}
      </span>
      <Button size="sm" variant="danger" disabled={busy} onClick={onConfirm}>
        {busy ? tr.common.deleting : tr.common.yesDelete}
      </Button>
      <Button size="sm" disabled={busy} onClick={onCancel}>
        {tr.common.cancel}
      </Button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
