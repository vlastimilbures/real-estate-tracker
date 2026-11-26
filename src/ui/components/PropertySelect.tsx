// Unified property selector: pill chips for small portfolios, dropdown past threshold.
// Presentational only — no store, no maths.
import type { ReactNode } from "react";
import { useCallback, useId, useRef, useState } from "react";
import { useModalA11y } from "../hooks/useModalA11y";
import { useDismiss } from "../hooks/useDismiss";
import { useT } from "../hooks/useT";
import { cx } from "../../lib/cx";

const PILL_THRESHOLD = 5;

type Option = { value: string; label: string };

type MultiProps = {
  mode: "multi";
  options: Option[];
  allLabel: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** The group's test id; each pill adds `-all` or `-<value>`, the trigger `-trigger`. */
  testId: string;
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

// ─── Rows: what both renderers show ─────────────────────────────────────────

/** One choice: a pill, or an option in the open list. */
type Row = {
  key: string;
  label: string;
  checked: boolean;
  pick: () => void;
  title?: string | undefined;
  testId?: string | undefined;
};

/** The selection with `id` added, or removed when it was in. */
function toggled(selected: string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((x) => x !== id)
    : [...selected, id];
}

/** "All" (nothing selected), then one row per shown option. */
function multiRows(props: MultiProps, shown: Option[]): Row[] {
  const { allLabel, selected, onChange } = props;
  return [
    {
      key: "",
      label: allLabel,
      checked: selected.length === 0,
      pick: () => onChange([]),
    },
    ...shown.map((o) => ({
      key: o.value,
      label: o.label,
      checked: selected.includes(o.value),
      pick: () => onChange(toggled(selected, o.value)),
    })),
  ];
}

function singleRows({ options, selected, onChange }: SingleProps): Row[] {
  return options.map((o) => ({
    key: o.value,
    label: o.label,
    checked: o.value === selected,
    pick: () => onChange(o.value),
  }));
}

// ─── Pills (up to the threshold) ─────────────────────────────────────────────

function Pills({
  className,
  ariaLabel,
  testId,
  rows,
}: {
  className: string;
  ariaLabel?: string | undefined;
  testId?: string | undefined;
  rows: Row[];
}) {
  return (
    <div
      className={className}
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          className={cx("pill", r.checked && "on")}
          aria-pressed={r.checked}
          onClick={r.pick}
          title={r.title}
          data-testid={r.testId}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function MultiPills(props: MultiProps) {
  const { testId } = props;
  const rows = multiRows(props, props.options).map((r) => ({
    ...r,
    testId: `${testId}-${r.key === "" ? "all" : r.key}`,
  }));
  return (
    <Pills
      className="pill-group"
      ariaLabel={props.allLabel}
      testId={testId}
      rows={rows}
    />
  );
}

function SinglePills(props: SingleProps) {
  // A long name is cut with an ellipsis; hover shows it in full (ADR 0242 §3).
  const rows = singleRows(props).map((r) => ({ ...r, title: r.label }));
  return (
    <Pills
      className="pill-group segmented"
      ariaLabel={props.ariaLabel}
      testId={props.testId}
      rows={rows}
    />
  );
}

// ─── Dropdown (past the pill threshold) ──────────────────────────────────────

/**
 * The open list (ADR 0157). It mounts on open, so useModalA11y moves focus in;
 * Escape calls `onClose`. The options use a roving tabindex (one Tab stop):
 * ArrowUp/ArrowDown move, Home/End jump, Space and Enter pick.
 */
function ListboxPopover({
  id,
  label,
  rows,
  initial,
  multi,
  onClose,
  search,
}: {
  id: string;
  label: string;
  rows: Row[];
  initial: number;
  multi: boolean;
  onClose: () => void;
  search?: ReactNode;
}) {
  const ref = useModalA11y(onClose);
  const [active, setActive] = useState(initial);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const current = Math.max(0, Math.min(active, rows.length - 1));

  function move(to: number) {
    const next = Math.max(0, Math.min(to, rows.length - 1));
    setActive(next);
    optionRefs.current[next]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, i: number, row: Row) {
    const to = {
      ArrowDown: i + 1,
      ArrowUp: i - 1,
      Home: 0,
      End: rows.length - 1,
    }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      move(to);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      row.pick();
    }
  }

  // The search box sits beside the listbox, not in it: a listbox holds options only.
  return (
    <div className="property-select-pop" ref={ref}>
      {search}
      <div
        role="listbox"
        id={id}
        aria-label={label}
        aria-multiselectable={multi || undefined}
      >
        {rows.map((r, i) => (
          <div
            key={r.key}
            ref={(el) => {
              optionRefs.current[i] = el;
            }}
            className={cx("property-select-row", r.checked && "checked")}
            role="option"
            aria-selected={r.checked}
            tabIndex={i === current ? 0 : -1}
            onClick={() => {
              setActive(i);
              r.pick();
            }}
            onKeyDown={(e) => onKeyDown(e, i, r)}
          >
            {r.checked && <CheckIcon />}
            {r.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Trigger plus popover, shared by both modes. */
function Dropdown({
  label,
  listLabel,
  triggerClass,
  ariaLabel,
  rootTestId,
  triggerTestId,
  rows,
  initial,
  multi,
  closeOnPick,
  search,
}: {
  label: string;
  listLabel: string;
  triggerClass: string;
  ariaLabel?: string | undefined;
  rootTestId?: string | undefined;
  triggerTestId?: string;
  rows: Row[];
  initial: number;
  multi: boolean;
  closeOnPick: boolean;
  search?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const purposeId = useId();
  const valueId = useId();
  const close = useCallback(() => setOpen(false), []);
  // Escape and a pick that closes the list hand focus back to the trigger. A click or Tab
  // elsewhere does not: focus is already where the user put it.
  const closeToTrigger = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  // A press elsewhere closes the list and leaves focus where the user put it.
  useDismiss(close, { open, inside: [rootRef], outside: "mousedown" });
  const picked = closeOnPick
    ? rows.map((r) => ({
        ...r,
        pick: () => {
          r.pick();
          closeToTrigger();
        },
      }))
    : rows;

  return (
    <div
      className="property-select"
      ref={rootRef}
      data-testid={rootTestId}
      // Tabbing out of the list closes it (a click elsewhere is useDismiss's).
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to && !rootRef.current?.contains(to)) close();
      }}
    >
      {/* ADR 0197 (WCAG 2.5.3): the name is the purpose, then the value on screen. */}
      {ariaLabel && (
        <span id={purposeId} className="sr-only">
          {ariaLabel}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={ariaLabel ? `${purposeId} ${valueId}` : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        data-testid={triggerTestId}
      >
        <span id={valueId}>{label}</span>
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
        <ListboxPopover
          id={listId}
          label={listLabel}
          rows={picked}
          initial={initial}
          multi={multi}
          onClose={closeToTrigger}
          search={search}
        />
      )}
    </div>
  );
}

function MultiDropdown(props: MultiProps) {
  const { options, allLabel, selected, testId } = props;
  const t = useT();
  const [query, setQuery] = useState("");
  const allActive = selected.length === 0;
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );
  const label = allActive
    ? allLabel
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? allLabel)
      : t.common.nSelected(selected.length);

  return (
    <Dropdown
      label={label}
      listLabel={allLabel}
      triggerClass={`property-select-trigger pill${!allActive ? " on" : ""}`}
      rootTestId={testId}
      triggerTestId={`${testId}-trigger`}
      rows={multiRows(props, filtered)}
      initial={0}
      multi
      closeOnPick={false}
      search={
        options.length > 12 && (
          <input
            className="property-select-search"
            type="search"
            placeholder={t.common.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.common.searchProperties}
          />
        )
      }
    />
  );
}

function SingleDropdown(props: SingleProps) {
  const { options, selected, ariaLabel, testId } = props;
  const index = options.findIndex((o) => o.value === selected);
  const label = options[index]?.label ?? options[0]?.label ?? "";
  return (
    <Dropdown
      label={label}
      listLabel={ariaLabel ?? label}
      triggerClass="property-select-trigger pill on"
      ariaLabel={ariaLabel}
      rootTestId={testId}
      rows={singleRows(props)}
      initial={Math.max(index, 0)}
      multi={false}
      closeOnPick
    />
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
