import { useEffect, useLayoutEffect, useRef, type MouseEvent } from "react";
import { focusSection } from "./focusSection";
import { moreSides, scrollToShow } from "../model/sectionNav";

/** Room left beside a link scrolled into view, past the fade. */
const FADE_PAD = 24;

/**
 * In-page section links for a page's topbar (ADR 0107). A link scrolls its section under
 * the sticky topbar and moves focus to the section's heading; it never changes the
 * route, so the unsaved-changes guard is not involved. With `oneRow` the links take one
 * row that scrolls sideways in a narrow window (CSS), the current link kept in view and
 * a fade on the side with more (ADR 0225 §2); otherwise they wrap (ADR 0158).
 */
export function SectionNav({
  label,
  sections,
  current,
  onSelect,
  oneRow = false,
}: {
  label: string;
  sections: readonly { id: string; label: string }[];
  current: string | null;
  onSelect: (id: string) => void;
  oneRow?: boolean;
}) {
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Marks the sides with links out of view, for the fade.
  const markSides = () => {
    const nav = navRef.current;
    const list = listRef.current;
    if (!nav || !list) return;
    const more = moreSides(list.scrollLeft, list.clientWidth, list.scrollWidth);
    nav.dataset.moreStart = String(more.start);
    nav.dataset.moreEnd = String(more.end);
  };

  // The current link stays in view as it changes (scrolling, a jump).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!oneRow || !list) return;
    const link = list.querySelector<HTMLElement>('a[aria-current="location"]');
    if (link) {
      const next = scrollToShow(
        { start: link.offsetLeft, width: link.offsetWidth },
        { scroll: list.scrollLeft, width: list.clientWidth },
        FADE_PAD,
      );
      if (next !== null) list.scrollLeft = next;
    }
    markSides();
  }, [oneRow, current]);

  // The window's width decides whether the row overflows.
  useEffect(() => {
    if (!oneRow) return;
    window.addEventListener("resize", markSides);
    return () => window.removeEventListener("resize", markSides);
  }, [oneRow]);

  function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
    // No hash change: the app's routes live in the store, not the URL.
    e.preventDefault();
    if (focusSection(id)) onSelect(id);
  }
  return (
    <nav
      ref={navRef}
      className={oneRow ? "section-nav one-row" : "section-nav"}
      aria-label={label}
    >
      <ul ref={listRef} onScroll={oneRow ? markSides : undefined}>
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
