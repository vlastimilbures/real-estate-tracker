import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "../hooks/useModalA11y";

interface ModalProps {
  titleId: string;
  title: ReactNode;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  /** When set, the body and footer form one <form>: Return in a field submits it, and a
   *  footer button with type="submit" is the save button (UX-028). */
  onSubmit?: () => void;
  /** Unsaved input: Esc and backdrop clicks are ignored; ✕ and Cancel still close
   *  (UX-029). */
  dirty?: boolean;
  /** A write is running: ✕ is disabled, and Esc and backdrop clicks are ignored, so the
   *  write's outcome shows in the dialog (ADR 0142). */
  busy?: boolean;
  /** A long, read-only body that scrolls: it becomes a focusable region named by the
   *  title, so the keyboard can scroll it (UX-071). */
  scrollRegion?: boolean;
}

/**
 * Shared centered-dialog chrome (overlay, card, header, a11y wiring) used by every
 * "create/edit a record" flow — Property and Scenario forms alike — so the app has
 * one interaction pattern for that action instead of some being modals and others
 * inline page forms.
 */
export function Modal({
  titleId,
  title,
  onClose,
  closeLabel,
  children,
  footer,
  onSubmit,
  dirty = false,
  busy = false,
  scrollRegion = false,
}: ModalProps) {
  // Esc and the backdrop are easy to hit by accident, so they never discard input.
  const dismiss = () => {
    if (!dirty && !busy) onClose();
  };
  const dialogRef = useModalA11y(dismiss, { trap: true, restoreFocus: true });
  const content = (
    <>
      <div
        className="modal-body"
        {...(scrollRegion && {
          role: "region",
          "aria-labelledby": titleId,
          tabIndex: 0,
        })}
      >
        {children}
      </div>
      {footer && <div className="form-actions modal-foot">{footer}</div>}
    </>
  );

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && dismiss()}
    >
      <div
        className="modal-card"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label={closeLabel}
          >
            <X size={18} />
          </button>
        </div>
        {onSubmit ? (
          <form
            className="form-contents"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {content}
          </form>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
