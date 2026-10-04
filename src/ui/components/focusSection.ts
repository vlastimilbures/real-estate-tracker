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
