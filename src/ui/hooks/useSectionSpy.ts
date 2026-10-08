import { useEffect, useState } from "react";
import { pickCurrent } from "../model/sectionNav";

/** Height of the sticky topbar: the band a section must reach starts below it. */
function topbarHeight() {
  return Math.round(
    document.querySelector(".topbar")?.getBoundingClientRect().height ?? 0,
  );
}

/** The topbar's height, kept current: the section nav can wrap it a row taller (ADR 0158). */
function useTopbarHeight() {
  const [height, setHeight] = useState(topbarHeight);
  useEffect(() => {
    const bar = document.querySelector(".topbar");
    if (!bar || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(topbarHeight()));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  return height;
}

/**
 * The element id, of `ids` (in page order), whose section is in view (ADR 0107): the
 * first one inside a band from under the topbar to the middle of the window, or the
 * last one once the page is scrolled to the bottom. `select` marks a section at once,
 * for a nav click. Without IntersectionObserver it stays on the first (or selected) id.
 */
export function useSectionSpy(ids: readonly string[]) {
  const [current, setCurrent] = useState<string | null>(null);
  const key = ids.join(" ");
  const top = useTopbarHeight();
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const order = key.split(" ");
    const inBand = new Set<string>();
    let atBottom = false;
    const update = () =>
      setCurrent((prev) => pickCurrent(order, inBand, prev, atBottom));
    const band = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target.id);
          else inBand.delete(e.target.id);
        }
        update();
      },
      { rootMargin: `-${top}px 0px -50% 0px` },
    );
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) band.observe(el);
    }
    // A page that does not scroll is never "at the bottom": the first section stays.
    const onScroll = () => {
      const bottom =
        window.scrollY > 0 &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2;
      if (bottom !== atBottom) {
        atBottom = bottom;
        update();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      band.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [key, top]);
  const shown = current !== null && ids.includes(current) ? current : ids[0];
  return [shown ?? null, setCurrent] as const;
}
