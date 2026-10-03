import { useEffect, useRef } from "react";

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
 * - `restoreFocus`: on close, focus returns to the element that had it on open.
 *
 * `onClose` is read through a ref so an inline-arrow handler (a fresh identity each
 * render) doesn't re-run the focus effect on every keystroke — it runs once on mount.
 */
export function useModalA11y(
  onClose: () => void,
  { trap = false, restoreFocus = false } = {},
) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    function onKey(e: KeyboardEvent) {
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
      if (restoreFocus && opener?.isConnected) opener.focus();
    };
  }, [trap, restoreFocus]); // constant per call site, so this runs once on mount

  return ref;
}
