import { useEffect, useRef } from "react";
import { focusables, focusLost, reachable } from "../focus";
import { useDismiss } from "./useDismiss";

/**
 * Modal accessibility wiring: Escape-to-close plus moving focus into the dialog on
 * open (so keyboard users start inside it, not on the page behind). Attach the returned
 * ref to the dialog element; the caller still sets `role="dialog"`/`aria-modal`, and passes
 * `modal` with `aria-modal` (#600).
 *
 * Options (UX-029), off by default so popovers keep their lighter behaviour:
 * - `trap`: Tab / Shift+Tab wrap inside the dialog instead of walking into the page.
 * - `modal`: a modal dialog on the layer stack: the native menu's items wait while it is
 *   open (#600). A dropdown's list is a layer, not modal.
 * - `restoreFocus`: on close, focus returns to the element that had it on open, unless
 *   focus has already moved on (a click outside a popover keeps its target focused). When
 *   that element has left the page, focus goes to the first reachable focusable element
 *   of its nearest ancestor still on the page, below the app root (ADR 0173).
 *
 * Open dialogs and popovers are layers on one stack (ADR 0157, src/ui/layers.ts): Escape
 * and the Tab trap act on the top-most one only, so one Escape closes one layer.
 *
 * `onClose` is read when Escape comes (useDismiss), so an inline-arrow handler (a fresh
 * identity each render) doesn't re-run the focus effect on every keystroke — it runs once
 * on mount.
 */
export function useModalA11y(
  onClose: () => void,
  { trap = false, restoreFocus = false, modal = false } = {},
) {
  const ref = useRef<HTMLDivElement>(null);
  // Declared before the focus effect, so the layer is on the stack before focus moves in.
  const isTop = useDismiss(() => onClose(), { escape: "top", modal });

  useEffect(() => {
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
      if (trap && e.key === "Tab" && isTop()) wrapTab(e);
    }
    function wrapTab(e: KeyboardEvent) {
      const root = ref.current;
      if (!root) return;
      const active = document.activeElement;
      // Focus inside a portaled child (the date popover) is left alone.
      if (!focusLost(root)) return;
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
      // Return focus only when it is lost: fallen back to <body> with the dialog's nodes,
      // or still inside the dialog (StrictMode's rehearsal cleanup, before a real close).
      if (!restoreFocus || !focusLost(el) || !opener) return;
      if (opener.isConnected) opener.focus();
      else {
        // Gone with its popover (a dropdown option): the first reachable focusable element
        // of the nearest ancestor still on the page, such as the dropdown's trigger.
        const home = ancestors.find((a) => a.isConnected);
        if (home) focusables(home).find(reachable)?.focus();
      }
    };
  }, [trap, restoreFocus, isTop]); // constant per call site, so this runs once on mount

  return ref;
}
