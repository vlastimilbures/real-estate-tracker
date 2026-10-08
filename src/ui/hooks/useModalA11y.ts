import { useEffect, useLayoutEffect, useRef } from "react";

const FOCUSABLE =
  "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])";

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex >= 0,
  );
}

/**
 * Modal accessibility wiring: Escape-to-close plus moving focus into the dialog on
 * open (so keyboard users start inside it, not on the page behind). Attach the returned
 * ref to the dialog element; the caller still sets `role="dialog"`/`aria-modal`.
 *
 * Options (UX-029), off by default so popovers keep their lighter behaviour:
 * - `trap`: Tab / Shift+Tab wrap inside the dialog instead of walking into the page.
 * - `restoreFocus`: on close, focus returns to the element that had it on open, unless
 *   focus has already moved on (a click outside a popover keeps its target focused).
 *
 * Open dialogs and popovers form a stack (ADR 0157): Escape and the Tab trap act on the
 * top-most one only, so one Escape closes one layer.
 *
 * `onClose` is read through a ref so an inline-arrow handler (a fresh identity each
 * render) doesn't re-run the focus effect on every keystroke — it runs once on mount.
 */
const stack: symbol[] = [];

export function useModalA11y(
  onClose: () => void,
  { trap = false, restoreFocus = false } = {},
) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  // Refresh the ref after each render (not during it); layout effects run before any
  // keydown can reach the handler.
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const self = Symbol("dialog");
    stack.push(self);
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    function onKey(e: KeyboardEvent) {
      if (stack.at(-1) !== self) return;
      if (e.key === "Escape") closeRef.current();
      else if (trap && e.key === "Tab") wrapTab(e);
    }
    function wrapTab(e: KeyboardEvent) {
      const root = ref.current;
      if (!root) return;
      const active = document.activeElement;
      // Focus inside a portaled child (the date popover) is left alone.
      if (active && active !== document.body && !root.contains(active)) return;
      const list = focusables(root);
      const first = list[0];
      const last = list.at(-1);
      if (!first || !last) return;
      if (!root.contains(active) || active === root) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const el = ref.current;
    const first = el ? focusables(el)[0] : undefined;
    (first ?? el)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(self), 1);
      // Focus that left with the dialog's nodes falls back to <body>; only then return it.
      const lost =
        !document.activeElement || document.activeElement === document.body;
      if (restoreFocus && lost && opener?.isConnected) opener.focus();
    };
  }, [trap, restoreFocus]); // constant per call site, so this runs once on mount

  return ref;
}
