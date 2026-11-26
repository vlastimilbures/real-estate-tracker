// A horizontal tab strip (ADR 0157, horizontal per ADR 0221): one Tab stop on the
// selected tab; Left/Right, Home and End move focus, and Enter or Space (the buttons'
// own click) switches. Manual activation, because a switch can raise the unsaved-changes
// guard and moving focus alone must not. The caller renders the tab panel.
import { useRef, type KeyboardEvent } from "react";

interface Tab<K extends string> {
  key: K;
  label: string;
}

/** Where the arrows, Home and End move focus from tab `i` of `count`; undefined for any
 *  other key. */
function focusTarget(
  key: string,
  i: number,
  count: number,
): number | undefined {
  const last = count - 1;
  return {
    ArrowRight: i === last ? 0 : i + 1,
    ArrowLeft: i === 0 ? last : i - 1,
    Home: 0,
    End: last,
  }[key];
}

export function Tabs<K extends string>({
  label,
  tabs,
  selected,
  onSelect,
  tabId,
  panelId,
}: {
  label: string;
  tabs: Tab<K>[];
  selected: K;
  onSelect: (key: K) => void;
  /** The id of each tab, which labels the panel. */
  tabId: (key: K) => string;
  /** The panel the selected tab controls. */
  panelId: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const to = focusTarget(e.key, i, tabs.length);
    if (to === undefined) return;
    e.preventDefault();
    refs.current[to]?.focus();
  };
  return (
    <div
      className="tab-strip"
      role="tablist"
      aria-orientation="horizontal"
      aria-label={label}
    >
      {tabs.map((tab, i) => {
        const active = tab.key === selected;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={tabId(tab.key)}
            aria-selected={active}
            aria-controls={active ? panelId : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
