import { useEffect, useLayoutEffect, useRef } from "react";

const FOCUSABLE =
  "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])";

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex >= 0,
  );
}

/** Not hidden from the user: outside any inert, aria-hidden or hidden subtree, and
 *  rendered where the browser can tell. */
function reachable(el: HTMLElement): boolean {
  if (el.closest("[inert], [aria-hidden='true'], [hidden]")) return false;
  return typeof el.checkVisibility !== "function" || el.checkVisibility();
}

/**
 * Modal accessibility wiring: Escape-to-close plus moving focus into the dialog on
 * open (so keyboard users start inside it, not on the page behind). Attach the returned
 * ref to the dialog element; the caller still sets `role="dialog"`/`aria-modal`.
 *
 * Options (UX-029), off by default so popovers keep their lighter behaviour:
 * - `trap`: Tab / Shift+Tab wrap inside the dialog instead of walking into the page.
 * - `restoreFocus`: on close, focus returns to the element that had it on open, unless
 *   focus has already moved on (a click outside a popover keeps its target focused). When
 *   that element has left the page, focus goes to the first reachable focusable element
 *   of its nearest ancestor still on the page, below the app root (ADR 0173).
 *
 * Open dialogs and popovers form a stack (ADR 0157): Escape and the Tab trap act on the
 * top-most one only, so one Escape closes one layer.
 *
 * `onClose` is read through a ref so an inline-arrow handler (a fresh identity each
 * render) doesn't re-run the focus effect on every keystroke — it runs once on mount.
 */
const stack: symbol[] = [];

/** True while a dialog or popover is open: it owns Escape (ADR 0157, ADR 0173). */
export const layerOpen = (): boolean => stack.length > 0;

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
    // The opener's ancestors, nearest first: the fallback when the opener itself has left
    // the page by the time the dialog closes (ADR 0173, #280). The walk stops below the
    // app root, so the fallback never lands on the page's first focusable (the skip link).
    const ancestors: HTMLElement[] = [];
    for (
      let a = opener?.parentElement;
      a && a !== document.body && a.id !== "root";
      a = a.parentElement
    )
      ancestors.push(a);
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
      // Return focus only when it is lost: fallen back to <body> with the dialog's nodes,
      // or still inside the dialog (StrictMode's rehearsal cleanup, before a real close).
      const active = document.activeElement;
      const lost =
        !active || active === document.body || !!el?.contains(active);
      if (!restoreFocus || !lost || !opener) return;
      if (opener.isConnected) opener.focus();
      else {
        // Gone with its popover (a dropdown option): the first reachable focusable element
        // of the nearest ancestor still on the page, such as the dropdown's trigger.
        const home = ancestors.find((a) => a.isConnected);
        if (home) focusables(home).find(reachable)?.focus();
      }
    };
  }, [trap, restoreFocus]); // constant per call site, so this runs once on mount

  return ref;
}
