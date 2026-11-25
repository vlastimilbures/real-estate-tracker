// Moving focus when a control leaves or a view switches (#491): which elements Tab reaches,
// whether focus is lost, and the section jump. Every "is focus lost" test in src/ui is
// `focusLost`.

const FOCUSABLE =
  "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])";

/** The enabled elements under `root` that Tab reaches, in document order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex >= 0,
  );
}

/** Not hidden from the user: outside any inert, aria-hidden or hidden subtree, and
 *  rendered where the browser can tell. */
export function reachable(el: HTMLElement): boolean {
  if (el.closest("[inert], [aria-hidden='true'], [hidden]")) return false;
  return typeof el.checkVisibility !== "function" || el.checkVisibility();
}

/** Whether focus is lost, so moving it takes nothing from the user: nothing has focus, it
 *  fell back to `<body>` (its element left the page), or it is still inside `within`, the
 *  part that is leaving or switching. Focus the user put anywhere else is not lost. */
export function focusLost(within?: Node | null): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !!within?.contains(active);
}

/**
 * Moves focus to the section's heading and scrolls the section to the top. False when the
 * section is not on the page. Shared by the section nav (ADR 0107) and the data check's fix
 * links (ADR 0118).
 */
export function focusSection(id: string): boolean {
  const section = document.getElementById(id);
  if (!section) return false;
  section.querySelector<HTMLElement>("h2, h3")?.focus({ preventScroll: true });
  section.scrollIntoView?.({ block: "start" });
  return true;
}
