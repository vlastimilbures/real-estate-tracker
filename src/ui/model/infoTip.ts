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

/** What shows an info tip (ADR 0217 §2): the pointer on it, keyboard focus on its button,
 *  or a pin from a click. Escape or a press outside dismisses it while the pointer or
 *  focus that showed it is still there; it shows again once both have left and one comes
 *  back. */
export interface TipState {
  hovered: boolean;
  focused: boolean;
  pinned: boolean;
  dismissed: boolean;
}

export const TIP_AT_REST: TipState = {
  hovered: false,
  focused: false,
  pinned: false,
  dismissed: false,
};

/** What happened to the tip. `blur.leftTip`: focus went outside the tip, which unpins it
 *  (a pin never outlives the user's attention). */
export type TipEvent =
  | { type: "hover"; on: boolean }
  | { type: "focus" }
  | { type: "blur"; leftTip: boolean }
  | { type: "click" }
  | { type: "dismiss" };

export const tipOpen = (s: TipState): boolean =>
  !s.dismissed && (s.pinned || s.hovered || s.focused);

/** One trigger changed; a dismissal ends once neither trigger is left. */
function setTrigger(
  s: TipState,
  k: "hovered" | "focused",
  on: boolean,
): TipState {
  const next = { ...s, [k]: on };
  return !on && !next.hovered && !next.focused
    ? { ...next, dismissed: false }
    : next;
}

const dismiss = (s: TipState): TipState => ({
  ...s,
  pinned: false,
  dismissed: s.hovered || s.focused,
});

export function tipReducer(s: TipState, e: TipEvent): TipState {
  switch (e.type) {
    case "hover":
      return setTrigger(s, "hovered", e.on);
    case "focus":
      return setTrigger(s, "focused", true);
    case "blur":
      return setTrigger(
        e.leftTip ? { ...s, pinned: false } : s,
        "focused",
        false,
      );
    case "click":
      // A toggle: shown by a pin, or by focus alone (a keyboard Enter), it closes; shown
      // by hover, or hidden, it pins open.
      return tipOpen(s) && (s.pinned || !s.hovered)
        ? dismiss(s)
        : { ...s, dismissed: false, pinned: true };
    case "dismiss":
      return dismiss(s);
  }
}
