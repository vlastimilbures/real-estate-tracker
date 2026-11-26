// Closing a layer on Escape or a press outside it: the one implementation. Which layer
// hears an Escape first is today's order, kept as named options; folding them into one
// stack order would change what one Escape closes (a tip that is only pinned closes
// together with its dialog), so that is left to a decision of its own.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { pushLayer, type Layer } from "../layers";

/**
 * When a layer hears Escape, first to last:
 * - `tip`: before anything else (window, capture): the info tip and a hovered row action's
 *   tooltip (ADR 0199, ADR 0217). `stops` says whether the Escape ends there.
 * - `first`: next (document, capture), and the Escape always ends there: the date popover,
 *   so a dialog behind it stays. Not an open layer (`anyOpen`).
 * - `top`: last (document, bubble), and only while it is the top layer: dialogs and the
 *   dropdown's list (ADR 0157). An open layer while it is on the page.
 * An element's own key handler (`isEscape`) hears it between `first` and `top`.
 */
export type EscapeOrder = "tip" | "first" | "top";

/**
 * Which press outside closes it:
 * - `mousedown`: a mousedown that reaches the document (the date popover, the dropdown).
 * - `press`: a pointerdown or a mousedown, heard first (capture): the info tip. Both,
 *   since a press from assistive technology may send a mousedown alone; after a
 *   pointerdown has closed it, the mousedown finds nothing left to close.
 */
export type OutsidePress = "mousedown" | "press";

export type DismissCause = "escape" | "outside";

export interface DismissOptions {
  /** Listening only while open; a `top` layer is on the stack only then. Default true. */
  open?: boolean | undefined;
  /** The layer's own nodes: a press inside any of them is not outside. */
  inside?: readonly RefObject<HTMLElement | null>[] | undefined;
  /** Escape closes it, heard in this order; none: Escape does not. */
  escape?: EscapeOrder | undefined;
  /** For `tip`: whether this Escape ends at the layer (default: it does). */
  stops?: (() => boolean) | undefined;
  /** Which press outside closes it; none: a press outside does not. */
  outside?: OutsidePress | undefined;
  /** For `top`: a modal dialog, so the native menu waits while it is open. */
  modal?: boolean | undefined;
}

/**
 * Calls `onDismiss` with the cause when Escape or a press outside closes the layer. The
 * callbacks and `inside` are read when the event comes, so an inline handler (a fresh
 * identity on each render) does not re-attach the listeners. Returns whether the layer is
 * the top one now (false unless `escape` is `top`), for a Tab trap.
 */
export function useDismiss(
  onDismiss: (cause: DismissCause) => void,
  {
    open = true,
    inside,
    escape,
    stops,
    outside,
    modal = false,
  }: DismissOptions,
): () => boolean {
  const latest = useRef({ onDismiss, inside, stops });
  // Refreshed after each render (not during it); layout effects run before any event can
  // reach the listeners.
  useLayoutEffect(() => {
    latest.current = { onDismiss, inside, stops };
  });
  const layer = useRef<Layer | null>(null);

  useEffect(() => {
    if (!open) return;
    const own = escape === "top" ? pushLayer({ modal }) : null;
    layer.current = own;
    const onKey = (e: Event) => {
      if (!isEscape(e as KeyboardEvent) || (own && !own.isTop())) return;
      const stop =
        escape === "first" ||
        (escape === "tip" && (latest.current.stops?.() ?? true));
      if (stop) e.stopPropagation();
      latest.current.onDismiss("escape");
    };
    const onPress = (e: Event) => {
      const target = e.target as Node;
      if (latest.current.inside?.some((r) => r.current?.contains(target)))
        return;
      latest.current.onDismiss("outside");
    };
    const keys: EventTarget = escape === "tip" ? window : document;
    const keyCapture = escape !== "top";
    const presses = outside === "press" ? ["pointerdown", "mousedown"] : [];
    if (outside === "mousedown") presses.push("mousedown");
    const pressCapture = outside === "press";
    if (escape) keys.addEventListener("keydown", onKey, keyCapture);
    for (const p of presses)
      document.addEventListener(p, onPress, pressCapture);
    return () => {
      if (escape) keys.removeEventListener("keydown", onKey, keyCapture);
      for (const p of presses)
        document.removeEventListener(p, onPress, pressCapture);
      own?.pop();
      layer.current = null;
    };
  }, [open, escape, outside, modal]);

  return useCallback(() => layer.current?.isTop() ?? false, []);
}

/** Whether a key event is Escape: also for an element's own key handler, which hears an
 *  Escape pressed inside it (a confirm row, a focused row action). */
export const isEscape = (e: { key: string }): boolean => e.key === "Escape";
