import type { MouseEvent } from "react";
import { focusSection } from "./focusSection";

/**
 * In-page section links for a page's topbar (ADR 0107). A link scrolls its section under
 * the sticky topbar and moves focus to the section's heading; it never changes the
 * route, so the unsaved-changes guard is not involved.
 */
export function SectionNav({
  label,
  sections,
  current,
  onSelect,
}: {
  label: string;
  sections: readonly { id: string; label: string }[];
  current: string | null;
  onSelect: (id: string) => void;
}) {
  function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
    // No hash change: the app's routes live in the store, not the URL.
    e.preventDefault();
    if (focusSection(id)) onSelect(id);
  }
  return (
    <nav className="section-nav" aria-label={label}>
      <ul>
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={s.id === current ? "location" : undefined}
              onClick={(e) => jump(e, s.id)}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
