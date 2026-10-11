// Where focus goes after a confirmed action closes its row (ADR 0173): the panel that held
// the row, or the page's h1 when that panel is gone. Both take focus from script only.
import { createContext, useContext, type RefObject } from "react";

/** The enclosing Panel's `section`, for a child that must hand focus back to it. */
export const PanelContext = createContext<RefObject<HTMLElement> | null>(null);

export const usePanelRef = () => useContext(PanelContext);

/**
 * Moves focus to the panel (or, when it has left the page, the page's h1) only when focus
 * is lost: on `<body>`, or still inside `row`. A row or form opened meanwhile keeps it.
 */
export function focusPanelAfter(
  panel: RefObject<HTMLElement> | null,
  row: HTMLElement | null,
): void {
  const active = document.activeElement;
  const lost = !active || active === document.body || !!row?.contains(active);
  if (!lost) return;
  const section = panel?.current;
  const target = section?.isConnected
    ? section
    : document.querySelector<HTMLElement>("h1");
  target?.focus();
}
