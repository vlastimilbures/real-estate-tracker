// The sticky top bar, measured in one place: the --topbar-h a section jump lands under
// (scroll-margin-top), the band the section nav watches (ADR 0158), and the edge an info
// tip stays below (ADR 0217).
import { useEffect, useState, type RefObject } from "react";

const TOPBAR = ".topbar";

/** The top bar's box in the window, or null while no page shows one. */
export function topbarRect(): DOMRect | null {
  return document.querySelector(TOPBAR)?.getBoundingClientRect() ?? null;
}

function topbarHeight(): number {
  return Math.round(topbarRect()?.height ?? 0);
}

/** The top bar's height, kept current: the section nav can wrap it a row taller
 *  (ADR 0158). */
export function useTopbarHeight(): number {
  const [height, setHeight] = useState(topbarHeight);
  useEffect(() => {
    const bar = document.querySelector(TOPBAR);
    if (!bar || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(topbarHeight()));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  return height;
}

/**
 * The height of the top bar `ref` holds, as --topbar-h on the page, so an in-page jump
 * lands a section below the sticky top bar (scroll-margin-top), whatever rows the bar wraps
 * to. Set once before observing: the observer reports only after the next layout, and a jump
 * made right after navigation (a data check fix link, ADR 0118) needs it now.
 */
export function usePublishTopbarHeight(
  ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const bar = ref.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const measure = () =>
      root.style.setProperty("--topbar-h", `${bar.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--topbar-h");
    };
  }, [ref]);
}
