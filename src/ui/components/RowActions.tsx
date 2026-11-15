// Row actions on every list (ADR 0199): icon-only quiet buttons whose name is also the
// tooltip shown on hover and on keyboard focus.
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

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
 * tooltip. Escape hides a showing tooltip without moving focus and stops there; once it
 * is hidden, Escape reaches the dialog or form as before (WCAG 1.4.13).
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
  const cls = ["row-action", danger ? "danger" : "", tipOff ? "tip-off" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || tipOff || !tipShows(e.currentTarget)) return;
        e.stopPropagation();
        setTipOff(true);
      }}
      onBlur={() => setTipOff(false)}
      onMouseLeave={() => setTipOff(false)}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="row-action-tip">{label}</span>
    </button>
  );
}
