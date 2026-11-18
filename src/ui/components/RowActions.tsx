// Row actions on every list (ADR 0199): icon-only quiet buttons whose name is also the
// tooltip shown on hover and on keyboard focus.
import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useWriteRunning } from "../../state/portfolioStore";

/** The group of a row's actions, right-aligned with 4 px between targets. */
export function RowActions({ children }: { children: ReactNode }) {
  return <span className="row-actions">{children}</span>;
}

/** Whether the tooltip shows now: the button is hovered or has keyboard focus. */
function tipShows(el: HTMLElement): boolean {
  try {
    return el.matches(":hover") || el.matches(":focus-visible");
  } catch {
    // An engine without `:focus-visible` in `matches`: focus is the closest signal.
    return document.activeElement === el;
  }
}

/**
 * One icon-only row action. `label` is the accessible name (the button's text) and the
 * tooltip. Escape hides a showing tooltip, hovered or focused, without moving focus and
 * stops there; once it is hidden, Escape reaches the dialog or form as before (WCAG
 * 1.4.13). A click on the tooltip itself only hides it: the tooltip may cover the button
 * beside it, and that click was meant for what is underneath.
 */
export function RowAction({
  icon: Icon,
  label,
  danger = false,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  /** A destructive action: neutral at rest, red on hover and focus. */
  danger?: boolean | undefined;
  disabled?: boolean | undefined;
  onClick: () => void;
}) {
  const [tipOff, setTipOff] = useState(false);
  const [hovered, setHovered] = useState(false);
  // While hovered, the tooltip shows whatever has focus: catch Escape before anything
  // else (a dialog's own Escape listener) and hide it.
  useEffect(() => {
    if (!hovered || tipOff) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setTipOff(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hovered, tipOff]);
  const cls = ["row-action", danger ? "danger" : "", tipOff ? "tip-off" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      disabled={disabled}
      onClick={(e) => {
        if ((e.target as Element).closest(".row-action-tip")) {
          setTipOff(true);
          return;
        }
        // The action ran: its tooltip has done its job and stays hidden until the
        // pointer leaves or focus moves, so the next Escape reaches the confirm row or
        // dialog the action opened.
        setTipOff(true);
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || tipOff || !tipShows(e.currentTarget)) return;
        e.stopPropagation();
        setTipOff(true);
      }}
      // A dismissed tooltip shows again on the next hover or focus, once the pointer has
      // left and focus has moved: not while either still rests on the button (a focused
      // button's tooltip would come back under the pointer that just hid it).
      onBlur={() => {
        if (!hovered) setTipOff(false);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={(e) => {
        setHovered(false);
        if (document.activeElement !== e.currentTarget) setTipOff(false);
      }}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="row-action-tip">{label}</span>
    </button>
  );
}

/** A row action that writes or opens a write (Edit, Delete, Duplicate): disabled while
 *  any write is queued or running, as well as when `disabled` (ADR 0253). */
export function WriteRowAction(props: Parameters<typeof RowAction>[0]) {
  const writing = useWriteRunning();
  return <RowAction {...props} disabled={props.disabled || writing} />;
}
