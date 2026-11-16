// Where an info popover goes (ADR 0217 §2): pure geometry, so it is unit-tested apart
// from the DOM.

/** Gap kept between the popover and the window's edges (the page's side gutter). */
const EDGE = 16;
/** Gap between the button and the popover. */
const GAP = 6;
export interface TipPlace {
  left: number;
  top: number;
  /** False while the button is scrolled out of the visible area (under the top bar). */
  visible: boolean;
}

/**
 * Where the popover goes: under the button, or above it when there is more room above;
 * its left edge shifted so it stays inside the window. `areaTop` is the top of the visible
 * area (the sticky top bar's bottom). Fixed, so a panel's `overflow: hidden` never clips it;
 * its CSS max-height keeps a long text inside the window.
 */
export function placeTip(
  button: { top: number; bottom: number; left: number },
  pop: { width: number; height: number },
  win: { width: number; height: number },
  areaTop = 0,
): TipPlace {
  const maxLeft = win.width - EDGE - pop.width;
  const left = Math.max(EDGE, Math.min(button.left, maxLeft));
  const ceiling = Math.max(EDGE, areaTop);
  const below = button.bottom + GAP;
  const roomBelow = win.height - EDGE - below;
  const roomAbove = button.top - GAP - ceiling;
  const top =
    pop.height <= roomBelow || roomBelow >= roomAbove
      ? below
      : Math.max(ceiling, button.top - GAP - pop.height);
  const visible = button.bottom > areaTop && button.top < win.height;
  return { left, top, visible };
}
