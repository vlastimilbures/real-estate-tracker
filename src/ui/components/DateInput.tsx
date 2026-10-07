// Text date field (dd.mm.yyyy, app convention) with an added calendar popover.
// Manual typing stays the source of truth; the calendar is an additive convenience.
// String-level contract — the picker just writes a dd.mm.yyyy string — so every path
// still round-trips through parseDate/dateDraft and the engine parity is untouched.
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "lucide-react";
import { dateDraft, parseDate } from "../model/formParse";
import { localDay, localMidnight } from "../../lib/day";
import { useT } from "../hooks/useT";
import { useFieldControlProps } from "./fieldContext";
import type { DateCalendar } from "./DateCalendar";

// The calendar loads on the first open (DR-009): react-day-picker stays out of the startup
// bundle. The popover opens once the chunk is in, so it never shows a placeholder; the
// chunk is a local file, so the wait is a few milliseconds (ADR 0066).
let LoadedCalendar: typeof DateCalendar | undefined;
async function loadCalendar(): Promise<void> {
  LoadedCalendar = (await import("./DateCalendar")).DateCalendar;
}

// dd.mm.yyyy for a day picked in the calendar. The day comes from react-day-picker as a
// LOCAL Date, so take its local calendar day (localDay) to avoid an off-by-one near
// midnight.
function localDayToDraft(day: Date): string {
  return dateDraft(localDay(day));
}

export function DateInput({
  value,
  onChange,
  onPick,
  placeholder,
  min,
  max,
  ...rest
}: {
  /** dd.mm.yyyy draft string ("" allowed). */
  value: string;
  /** Fired on every text edit. */
  onChange: (v: string) => void;
  /** Fired (instead of onChange) when a day is chosen in the calendar; lets callers
   *  with commit semantics (e.g. AsOfPicker) apply the pick immediately. Defaults to
   *  onChange. */
  onPick?: ((v: string) => void) | undefined;
  placeholder?: string | undefined;
  /** First and last selectable calendar day (UTC midnight dates); typing is not
   *  limited here, the caller checks a typed value. */
  min?: Date | undefined;
  max?: Date | undefined;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "min" | "max"
>) {
  const t = useT();
  const fieldProps = useFieldControlProps();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Portaled to <body> with fixed coords so the calendar escapes the form's
  // overflow:hidden/auto ancestors (modal card, panel) that were clipping it.
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );

  // The draft is a UTC date; re-express it as a local-midnight date with the same
  // Y/M/D so the highlighted cell matches what the user typed regardless of timezone.
  const utc = parseDate(value);
  const selected = utc ? localMidnight(utc) : undefined;
  const first = min ? localMidnight(min) : undefined;
  const last = max ? localMidnight(max) : undefined;

  // Closing also forgets the coords, so the next open stays hidden until measured.
  function close() {
    setOpen(false);
    setCoords(null);
  }

  // Lightweight popover dismissal: outside-click + Esc, returning focus to the trigger.
  // Not a modal (no global focus trap) — it sits inline in a form. The popover is
  // portaled, so the "inside" check must cover both the field and the popover node.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || popRef.current?.contains(target))
        return;
      close();
    }
    // Capture phase + stopPropagation: Esc closes only the popover, never a modal
    // listening on document behind it (DR-148).
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Position the fixed popover from the field's rect: below it, or flipped above when
  // there isn't room. Recomputed on scroll/resize so it tracks the field.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const anchor = rootRef.current;
      const pop = popRef.current;
      if (!anchor || !pop) return;
      const r = anchor.getBoundingClientRect();
      const gap = 4;
      const margin = 8;
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      let left = Math.min(r.left, window.innerWidth - pw - margin);
      left = Math.max(margin, left);
      let top = r.bottom + gap;
      // Flip above only if it doesn't fit below AND there's more room above.
      if (top + ph > window.innerHeight - margin && r.top - gap - ph > margin) {
        top = r.top - gap - ph;
      }
      setCoords({ left, top });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  function handleSelect(day: Date | undefined) {
    if (day) (onPick ?? onChange)(localDayToDraft(day));
    close();
    triggerRef.current?.focus();
  }

  return (
    <div className="date-input" ref={rootRef}>
      <div className="input-wrap">
        <input
          {...fieldProps}
          className="has-trailing-btn"
          value={value}
          placeholder={placeholder ?? t.forms.datePlaceholder}
          inputMode="text"
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
        <button
          type="button"
          ref={triggerRef}
          className="date-trigger"
          aria-label={t.calendar.open}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            if (open) close();
            else if (LoadedCalendar) setOpen(true);
            else void loadCalendar().then(() => setOpen(true));
          }}
        >
          <Calendar size={16} aria-hidden />
        </button>
      </div>
      {open &&
        LoadedCalendar &&
        createPortal(
          <div
            ref={popRef}
            className="date-popover"
            role="dialog"
            aria-label={t.calendar.open}
            style={{
              left: coords?.left ?? -9999,
              top: coords?.top ?? -9999,
              visibility: coords ? "visible" : "hidden",
            }}
          >
            <LoadedCalendar
              selected={selected}
              first={first}
              last={last}
              onSelect={handleSelect}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
