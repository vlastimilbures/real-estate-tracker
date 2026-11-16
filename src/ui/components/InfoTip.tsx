// A definition behind an info icon beside a title (ADR 0217): hover or keyboard focus
// shows it in a small popover under the icon, a click pins it; Escape or a click outside
// hides it. The text is also the button's description, so a screen reader reads it on
// focus whether or not it shows.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Info } from "lucide-react";
import { useT } from "../hooks/useT";
import { placeTip } from "../model/infoTip";

function place(button: HTMLElement, pop: HTMLElement): void {
  const bar = document.querySelector(".topbar")?.getBoundingClientRect();
  const p = placeTip(
    button.getBoundingClientRect(),
    { width: pop.offsetWidth, height: pop.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    bar ? Math.max(0, bar.bottom) : 0,
  );
  pop.style.left = `${p.left}px`;
  pop.style.top = `${p.top}px`;
  pop.style.visibility = p.visible ? "" : "hidden";
}

export function InfoTip({
  topic,
  children,
}: {
  /** What it explains (the panel or section title): completes the accessible name, so
   *  two on a page differ. */
  topic: string;
  /** Plain text: the popover is inline (it sits in a heading row). */
  children: string;
}) {
  const t = useT();
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Escape or an outside click hides it while the pointer or focus that showed it is
  // still there; it shows again once that trigger leaves and comes back.
  const [dismissed, setDismissed] = useState(false);
  // The latest triggers, read by the window listeners and the handlers.
  const live = useRef({ hovered: false, focused: false });
  const open = !dismissed && (pinned || hovered || focused);

  const close = useCallback(() => {
    setPinned(false);
    setDismissed(live.current.hovered || live.current.focused);
  }, []);

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
  }, [open, children]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Captured first while the user is on the tip (hovering or focused), so a dialog's
      // own Escape waits until it is gone (ADR 0199). A tip that is only pinned closes and
      // lets the Escape through: it is not what the user is working on.
      if (live.current.hovered || live.current.focused) e.stopPropagation();
      close();
    };
    const onDown = (e: Event) => {
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
  }, [open, close]);

  const setTrigger = (k: "hovered" | "focused", on: boolean) => {
    live.current[k] = on;
    (k === "hovered" ? setHovered : setFocused)(on);
    // A dismissal ends once neither trigger is left.
    if (!on && !live.current.hovered && !live.current.focused)
      setDismissed(false);
  };

  return (
    <span
      ref={wrap}
      className="info-tip"
      onMouseEnter={() => setTrigger("hovered", true)}
      onMouseLeave={() => setTrigger("hovered", false)}
    >
      <button
        ref={button}
        type="button"
        className="info-tip-button"
        aria-label={`${t.common.aboutThis}: ${topic}`}
        aria-describedby={id}
        aria-expanded={open}
        aria-controls={id}
        onFocus={() => setTrigger("focused", true)}
        onBlur={(e) => {
          // Focus leaving the tip unpins it: a pin never outlives the user's attention.
          if (!wrap.current?.contains(e.relatedTarget as Node | null))
            setPinned(false);
          setTrigger("focused", false);
        }}
        onClick={() => {
          // A toggle: shown by a pin, or by focus alone (a keyboard Enter), it closes;
          // shown by hover, or hidden, it pins open.
          if (open && (pinned || !live.current.hovered)) close();
          else {
            setDismissed(false);
            setPinned(true);
          }
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
