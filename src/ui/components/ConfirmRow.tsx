// The one inline confirm for a destructive action (ADR 0143), used by the record panels,
// the scenario list, the Properties table and the deactivate banner. It keeps its own
// busy and error state.
import { useContext, useEffect, useId, useRef, useState } from "react";
import { Button } from "./primitives";
import { PanelSection } from "./panelFocus";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import type { MutationResult } from "../../state/portfolioStore";
import { anyOpen } from "../layers";
import { isEscape } from "../hooks/useDismiss";
import { focusLost } from "../focus";
import {
  focusableFromScript,
  pageTitle,
  useBusyFocus,
} from "../hooks/useBusyFocus";

/**
 * After a confirmed action closed its row (ADR 0173): focus the panel that held the row,
 * or the page's title (the PageFrame h1) when that panel has left the page. Only when focus
 * is lost (on `<body>`, or still inside `row`), so a row or form opened meanwhile keeps it.
 * The target takes focus from script only: `tabIndex=-1` is set for the focus and removed
 * again on blur. The section stays unnamed: a named section is a region landmark, and a
 * record panel's table is already a region named by the panel's title.
 */
function focusPanelAfter(
  panel: HTMLElement | null,
  row: HTMLElement | null,
): void {
  if (!focusLost(row)) return;
  const target = panel?.isConnected ? focusableFromScript(panel) : pageTitle();
  target?.focus();
}

/** A confirm row's Cancel, its last button: the safe choice (ADR 0143). */
const cancelButton = (row: HTMLElement | null) =>
  [...(row?.querySelectorAll("button") ?? [])].at(-1) ?? null;

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
  const rowRef = useRef<HTMLDivElement>(null);
  // A failed write puts focus on Cancel (ADR 0248 §1). A successful one keeps the row
  // busy until the caller closes it, so focus follows the row instead (ADR 0173).
  const [busy, setBusy] = useBusyFocus(() => cancelButton(rowRef.current));
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const messageId = useId();
  // The panel that holds the row (its <Panel>, through context), taken while the row is
  // on the page (a cleanup runs after the row has left it). The deactivate confirm relies
  // on ActivationBanner rendering <Panel> in both branches: the section is reused for the
  // inactive banner.
  const panelSection = useContext(PanelSection);
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
    // Cancel, so a held Enter on the trigger cannot reach the destructive one (ADR 0143).
    cancelButton(rowRef.current)?.focus();
  }, []);
  useEffect(() => {
    mounted.current = true;
    const row = rowRef.current;
    panel.current = panelSection();
    return () => {
      mounted.current = false;
      if (succeeded.current) focusPanelAfter(panel.current, row);
    };
  }, [panelSection]);
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
        if (isEscape(e) && !busy && !anyOpen()) cancel();
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
