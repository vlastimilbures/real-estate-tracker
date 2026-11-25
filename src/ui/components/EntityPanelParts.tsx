// Sub-components pulled out of EntityPanel.tsx to shrink its render tree. Presentation
// only; the delete confirm is ConfirmRow.tsx.
import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { TableWrap } from "./primitives";
import { RowActions, WriteRowAction } from "./RowActions";
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
            <th scope="col">
              <span className="sr-only">{tr.common.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="left text-faint" colSpan={columns.length + 1}>
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
              <td>
                <RowActions>
                  <WriteRowAction
                    icon={Pencil}
                    label={tr.common.edit}
                    onClick={() => onEdit(r.id)}
                  />
                  {onDelete && (
                    <WriteRowAction
                      icon={Trash2}
                      label={tr.common.delete}
                      danger
                      onClick={() => onConfirmDelete(r.id)}
                    />
                  )}
                </RowActions>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
