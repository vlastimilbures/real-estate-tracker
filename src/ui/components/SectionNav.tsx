import {
  useEffect,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { focusSection } from "../focus";
import { moreSides, scrollToShow } from "../model/sectionNav";

/** Room left beside a link scrolled into view: past the 32 px fade and the focus ring. */
const FADE_PAD = 40;

/** Marks the sides of a one-row nav with links out of view, for the fade. */
function markSides(nav: HTMLElement | null, list: HTMLElement | null) {
  if (!nav || !list) return;
  const more = moreSides(list.scrollLeft, list.clientWidth, list.scrollWidth);
  nav.dataset.moreStart = String(more.start);
  nav.dataset.moreEnd = String(more.end);
}

/** Scrolls a link into view in a one-row nav, clear of the fade. */
function show(list: HTMLElement | null, link: HTMLElement | null) {
  if (!list || !link) return;
  const next = scrollToShow(
    { start: link.offsetLeft, width: link.offsetWidth },
    { scroll: list.scrollLeft, width: list.clientWidth },
    FADE_PAD,
  );
  if (next !== null) list.scrollLeft = next;
}

/** Shows the current link, then marks the sides. */
function showCurrent(nav: HTMLElement | null, list: HTMLElement | null) {
  show(
    list,
    list?.querySelector<HTMLElement>('a[aria-current="location"]') ?? null,
  );
  markSides(nav, list);
}

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

  // The current link stays in view as it changes (scrolling, a jump).
  useLayoutEffect(() => {
    if (oneRow) showCurrent(navRef.current, listRef.current);
  }, [oneRow, current]);

  // And as the row or its links change size: a window crossing the breakpoint, another
  // language, a late font.
  useEffect(() => {
    const list = listRef.current;
    if (!oneRow || !list || typeof ResizeObserver === "undefined") return;
    const nav = navRef.current;
    const ro = new ResizeObserver(() => showCurrent(nav, list));
    ro.observe(list);
    list.querySelectorAll("li").forEach((li) => ro.observe(li));
    return () => ro.disconnect();
  }, [oneRow, sections]);

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
      <ul
        ref={listRef}
        onScroll={
          oneRow ? () => markSides(navRef.current, listRef.current) : undefined
        }
        // A link reached by Tab clears the fade too (the browser stops at the edge).
        onFocus={
          oneRow
            ? (e: FocusEvent<HTMLUListElement>) =>
                show(
                  listRef.current,
                  e.target instanceof HTMLElement ? e.target : null,
                )
            : undefined
        }
      >
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
