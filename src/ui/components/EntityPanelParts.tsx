// Sub-components pulled out of EntityPanel.tsx to shrink its render tree. Presentation
// only; ConfirmRow keeps its own busy and error state.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button, TableWrap } from "./primitives";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import type { MutationResult } from "../../state/portfolioStore";
import { layerOpen } from "../hooks/useModalA11y";

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

/**
 * After a confirmed action closed its row (ADR 0173): focus the panel that held the row,
 * or the page's title (the AppShell h1) when that panel has left the page. Only when focus
 * is lost (on `<body>`, or still inside `row`), so a row or form opened meanwhile keeps it.
 * The target takes focus from script only: `tabIndex=-1` is set for the focus and removed
 * again on blur. The section stays unnamed: a named section is a region landmark, and a
 * record panel's table is already a region named by the panel's title.
 */
function focusPanelAfter(
  panel: HTMLElement | null,
  row: HTMLElement | null,
): void {
  const active = document.activeElement;
  const lost = !active || active === document.body || !!row?.contains(active);
  if (!lost) return;
  const target = panel?.isConnected
    ? panel
    : document.querySelector<HTMLElement>(".topbar .page-title");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) {
    target.tabIndex = -1;
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), {
      once: true,
    });
  }
  target.focus();
}

/** The one inline confirm for a destructive action (ADR 0143). It runs `onConfirm` and
 *  stays open with the reason when the write fails (UX-050); the caller closes it on
 *  success. Focus moves to Cancel on open and back to the trigger on Cancel or Escape,
 *  and to the enclosing panel once a successful confirm has closed the row (ADR 0173);
 *  both buttons are described by the question, so a screen reader reads it. */
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
  /** Resolves with the write's outcome and never rejects, like the store's mutations. */
  onConfirm: () => Promise<MutationResult>;
  onCancel: () => void;
}) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const messageId = useId();
  // The panel that holds the row, found while the row is on the page (a cleanup runs
  // after the row has left it). The deactivate confirm relies on ActivationBanner
  // rendering <Panel> in both branches: the section is reused for the inactive banner.
  const panel = useRef<HTMLElement | null>(null);
  // Set once the write landed: the caller then closes the row, and focus follows it to
  // the panel (ADR 0173). `mounted` tells whether that close has already happened.
  const succeeded = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    // A passive effect: a guard dialog that closed in the same commit has already put
    // focus back on the trigger, so that is what is remembered here.
    if (document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
    // Cancel, the last button: the safe choice, so a held Enter on the trigger cannot
    // reach the destructive one (ADR 0143).
    [...(rowRef.current?.querySelectorAll("button") ?? [])].at(-1)?.focus();
  }, []);
  useEffect(() => {
    mounted.current = true;
    const row = rowRef.current;
    panel.current = row?.closest<HTMLElement>("section.panel") ?? null;
    return () => {
      mounted.current = false;
      if (succeeded.current) focusPanelAfter(panel.current, row);
    };
  }, []);
  const cancel = () => {
    onCancel();
    if (opener.current?.isConnected) opener.current.focus();
  };
  return (
    // Escape takes the Cancel path; not while the write runs, nor while a dialog or
    // popover is open, which owns Escape (ADR 0173).
    <div
      className="confirm-row"
      ref={rowRef}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy && !layerOpen()) cancel();
      }}
    >
      <div className="confirm-row-content">
        <span className="confirm-msg" id={messageId}>
          {message}
        </span>
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          aria-describedby={messageId}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await onConfirm();
            if (result.ok) {
              succeeded.current = true;
              // Already closed by the caller: focus follows now, not on unmount.
              if (!mounted.current) focusPanelAfter(panel.current, null);
              return;
            }
            setBusy(false);
            setError(describeWriteError(tr, result.error).message);
          }}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          aria-describedby={messageId}
          onClick={cancel}
        >
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
