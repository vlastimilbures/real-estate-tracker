// A definition behind an info icon beside a title (ADR 0217): hover, keyboard focus or a
// click shows it in a small popover under the icon; Escape or a click outside hides it.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Info } from "lucide-react";
import { useT } from "../hooks/useT";

/** Gap kept between the popover and the window's edges (the page's side gutter). */
const EDGE = 16;

/** Gap between the button and the popover. */
const GAP = 6;

/** Where the popover goes: under the button (above it when the window has no room
 *  below), its left edge shifted so it stays inside the window. Fixed, so a panel's
 *  `overflow: hidden` never clips it. */
function place(button: HTMLElement, pop: HTMLElement): void {
  const b = button.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const maxLeft = window.innerWidth - EDGE - w;
  pop.style.left = `${Math.max(EDGE, Math.min(b.left, maxLeft))}px`;
  const below = b.bottom + GAP;
  const above = b.top - GAP - h;
  const fitsBelow = below + h <= window.innerHeight - EDGE;
  pop.style.top = `${fitsBelow || above < EDGE ? below : above}px`;
}

export function InfoTip({
  topic,
  children,
}: {
  /** What it explains (the panel or section title): completes the accessible name, so
   *  two on a page differ. */
  topic: string;
  children: ReactNode;
}) {
  const t = useT();
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Escape or an outside click hides it until the pointer leaves and focus moves.
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (pinned || hovered || focused);

  const close = () => {
    setPinned(false);
    setDismissed(true);
  };

  useLayoutEffect(() => {
    if (!open || !button.current || !pop.current) return;
    const b = button.current;
    const p = pop.current;
    const update = () => place(b, p);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Captured first, so a dialog's own Escape waits until the tip is gone (ADR 0199).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    const onDown = (e: PointerEvent | MouseEvent) => {
      if (wrap.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("mousedown", onDown, true);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className="info-tip"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (!focused) setDismissed(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="info-tip-button"
        aria-label={`${t.common.aboutThis}: ${topic}`}
        aria-expanded={open}
        aria-controls={id}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (!hovered) setDismissed(false);
        }}
        onClick={() => {
          if (pinned && open) {
            close();
            return;
          }
          setDismissed(false);
          setPinned(true);
        }}
      >
        <Info size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <span ref={pop} id={id} className="info-tip-pop" hidden={!open}>
        {children}
      </span>
    </span>
  );
}
