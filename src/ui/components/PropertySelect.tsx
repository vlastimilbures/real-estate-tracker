// Unified property selector: pill chips for small portfolios, dropdown past threshold.
// Presentational only — no store, no maths.
import { useState, useRef, useEffect } from "react";
import { useModalA11y } from "../hooks/useModalA11y";
import { useT } from "../hooks/useT";

const PILL_THRESHOLD = 5;

type Option = { value: string; label: string };

type MultiProps = {
  mode: "multi";
  options: Option[];
  allLabel: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  testId?: string;
};

type SingleProps = {
  mode: "single";
  options: Option[];
  selected: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  testId?: string;
};

type Props = MultiProps | SingleProps;

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  cb: () => void,
) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, cb]);
}

// ─── Multi-select ────────────────────────────────────────────────────────────

function MultiPills({
  options,
  allLabel,
  selected,
  onChange,
  testId,
}: MultiProps) {
  const allActive = selected.length === 0;
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  return (
    <div
      className="pill-group"
      role="group"
      aria-label={allLabel}
      data-testid={testId ?? "dashboard-filter"}
    >
      <button
        type="button"
        className={`pill${allActive ? " on" : ""}`}
        aria-pressed={allActive}
        onClick={() => onChange([])}
        data-testid={testId ? `${testId}-all` : "dashboard-filter-all"}
      >
        {allLabel}
      </button>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={`pill${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            data-testid={
              testId ? `${testId}-${o.value}` : `dashboard-filter-${o.value}`
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiDropdown({
  options,
  allLabel,
  selected,
  onChange,
  testId,
}: MultiProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useModalA11y(() => setOpen(false));
  useClickOutside(rootRef, () => setOpen(false));

  const allActive = selected.length === 0;
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );
  const triggerLabel = allActive
    ? allLabel
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? allLabel)
      : `${selected.length} selected`;

  return (
    <div
      className="property-select"
      ref={rootRef}
      data-testid={testId ?? "dashboard-filter"}
    >
      <button
        type="button"
        className={`property-select-trigger pill${!allActive ? " on" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={testId ? `${testId}-trigger` : "dashboard-filter-trigger"}
      >
        {triggerLabel}
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          className="property-select-pop"
          role="listbox"
          aria-multiselectable="true"
          ref={panelRef}
        >
          {options.length > 12 && (
            <input
              className="property-select-search"
              type="search"
              placeholder={t.common.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t.common.searchProperties}
            />
          )}
          <div
            className={`property-select-row${allActive ? " checked" : ""}`}
            role="option"
            aria-selected={allActive}
            tabIndex={0}
            onClick={() => onChange([])}
            onKeyDown={(e) => e.key === "Enter" && onChange([])}
          >
            {allActive && <CheckIcon />}
            {allLabel}
          </div>
          {filtered.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <div
                key={o.value}
                className={`property-select-row${checked ? " checked" : ""}`}
                role="option"
                aria-selected={checked}
                tabIndex={0}
                onClick={() => toggle(o.value)}
                onKeyDown={(e) => e.key === "Enter" && toggle(o.value)}
              >
                {checked && <CheckIcon />}
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Single-select ───────────────────────────────────────────────────────────

function SinglePills({
  options,
  selected,
  onChange,
  ariaLabel,
  testId,
}: SingleProps) {
  return (
    <div
      className="pill-group segmented"
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {options.map((o) => {
        const on = o.value === selected;
        return (
          <button
            key={o.value}
            type="button"
            className={`pill${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SingleDropdown({
  options,
  selected,
  onChange,
  ariaLabel,
  testId,
}: SingleProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useModalA11y(() => setOpen(false));
  useClickOutside(rootRef, () => setOpen(false));

  const selectedLabel =
    options.find((o) => o.value === selected)?.label ?? options[0]?.label;

  return (
    <div className="property-select" ref={rootRef} data-testid={testId}>
      <button
        type="button"
        className="property-select-trigger pill on"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {selectedLabel}
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="property-select-pop" role="listbox" ref={panelRef}>
          {options.map((o) => {
            const on = o.value === selected;
            return (
              <div
                key={o.value}
                className={`property-select-row${on ? " checked" : ""}`}
                role="option"
                aria-selected={on}
                tabIndex={0}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onChange(o.value);
                    setOpen(false);
                  }
                }}
              >
                {on && <CheckIcon />}
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Public component ────────────────────────────────────────────────────────

export function PropertySelect(props: Props) {
  const t = useT();
  if (props.mode === "multi") {
    const allLabel = props.allLabel ?? t.common.all;
    const resolved = { ...props, allLabel };
    return props.options.length <= PILL_THRESHOLD ? (
      <MultiPills {...resolved} />
    ) : (
      <MultiDropdown {...resolved} />
    );
  } else {
    return props.options.length <= PILL_THRESHOLD ? (
      <SinglePills {...props} />
    ) : (
      <SingleDropdown {...props} />
    );
  }
}

function CheckIcon() {
  return (
    <svg
      className="property-select-check"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <path
        d="M2 6l3 3 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
