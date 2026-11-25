// A definition behind an info icon beside a title (ADR 0217): hover or keyboard focus
// shows it in a small popover under the icon, a click pins it; Escape or a click outside
// hides it. The text is also the button's description, so a screen reader reads it on
// focus whether or not it shows.
import { useCallback, useId, useLayoutEffect, useReducer, useRef } from "react";
import { Info } from "lucide-react";
import { useT } from "../hooks/useT";
import { useDismiss } from "../hooks/useDismiss";
import { placeTip, TIP_AT_REST, tipOpen, tipReducer } from "../model/infoTip";
import { topbarRect } from "../hooks/useTopbar";

function place(button: HTMLElement, pop: HTMLElement): void {
  const bar = topbarRect();
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
  // Hover, focus, a pin and a dismissal (tipReducer): Escape or an outside click hides it
  // while the pointer or focus that showed it is still there.
  const [tip, send] = useReducer(tipReducer, TIP_AT_REST);
  const open = tipOpen(tip);
  const close = useCallback(() => send({ type: "dismiss" }), []);

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

  // Escape is heard first of all while the user is on the tip (hovering or focused), and
  // ends there, so a dialog's own Escape waits until it is gone (ADR 0199). A tip that is
  // only pinned closes and lets the Escape through: it is not what the user is working on.
  useDismiss(close, {
    open,
    inside: [wrap],
    escape: "tip",
    stops: () => tip.hovered || tip.focused,
    outside: "press",
  });

  return (
    <span
      ref={wrap}
      className="info-tip"
      onMouseEnter={() => send({ type: "hover", on: true })}
      onMouseLeave={() => send({ type: "hover", on: false })}
    >
      <button
        ref={button}
        type="button"
        className="info-tip-button"
        aria-label={`${t.common.aboutThis}: ${topic}`}
        aria-describedby={id}
        aria-expanded={open}
        aria-controls={id}
        onFocus={() => send({ type: "focus" })}
        onBlur={(e) =>
          send({
            type: "blur",
            leftTip: !wrap.current?.contains(e.relatedTarget as Node | null),
          })
        }
        onClick={() => send({ type: "click" })}
      >
        <Info size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <span ref={pop} id={id} className="info-tip-pop" hidden={!open}>
        {/* A long text scrolls in here, not in the popover: there the hover bridges
            would be clipped and overflow it, making it a scroller that Chromium puts in
            the tab order, so Tab from the icon would land on a popover that hides as
            the icon loses focus. */}
        <span className="info-tip-pop-body">{children}</span>
      </span>
    </span>
  );
}
