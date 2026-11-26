// "As of" date picker for the Dashboard / Property detail snapshot. A dd.mm.yyyy
// text input (app convention) plus quick presets. `value === null` means "today".
// Presentational: it emits Date | null (null = Today) and keeps the date inside the
// projection window (ADR 0019). It shows the date the page computes for, by the one
// resolver (ADR 0150): a stale stored value or a future base date shows the clamped date.
// Place it directly in a `.filter-bar`: its hint is that bar's last row (ADR 0198).
import { useState, useId } from "react";
import { parseDate, dateDraft } from "../model/formParse";
import { todayUtc } from "../../lib/day";
import { addYears } from "../../engine";
import { useT } from "../hooks/useT";
import { DateInput } from "./DateInput";
import { clampAsOf, resolveAsOf, type AsOfBounds } from "../model/asOf";
import { cx } from "../../lib/cx";

/** The "+N years" presets after Today. */
const PRESET_YEARS = [1, 5] as const;

export function AsOfPicker({
  value,
  onChange,
  bounds,
  hint,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
  /** The projection window; a date outside it moves to its nearest end. */
  bounds: AsOfBounds;
  /** How the date maps to what the page shows (ADR 0088); none at Today. */
  hint?: string | null;
}) {
  const t = useT();
  const labelId = useId();
  const hintId = useId();
  const today = todayUtc();
  const { date: effective, isToday } = resolveAsOf(value, today, bounds);
  const [draft, setDraft] = useState(dateDraft(effective));

  // Keep the text in sync when the shown day changes: a preset changes the value, and at
  // Today midnight changes the day (ADR 0149 §4). Adjust the draft during render, rather
  // than in an effect.
  const [syncedTime, setSyncedTime] = useState(effective.getTime());
  if (effective.getTime() !== syncedTime) {
    setSyncedTime(effective.getTime());
    setDraft(dateDraft(effective));
  }

  const pick = (d: Date) => {
    const inside = clampAsOf(d, bounds);
    if (inside.getTime() !== d.getTime()) setDraft(dateDraft(inside));
    onChange(inside.getTime() === today.getTime() ? null : inside);
  };
  // The date already shown changes nothing in the store, so a blur never stores a pick
  // nobody made; the text is reformatted (ADR 0180 §6). Invalid input reverts.
  const commit = (raw: string) => {
    const parsed = parseDate(raw);
    if (parsed && clampAsOf(parsed, bounds).getTime() !== effective.getTime())
      pick(parsed);
    else setDraft(dateDraft(effective));
  };

  // A preset steps from today, never from a stored date, and is lit when the shown date
  // is its target: the one date both the pick and the highlight use.
  const presets = PRESET_YEARS.map((years) => {
    const target = addYears(today, years);
    const on = value !== null && effective.getTime() === target.getTime();
    return { years, target, on };
  });

  // The hint follows the group as the filter bar's own row (ADR 0198), so it may use the
  // bar's full width and never changes the picker's size.
  return (
    <>
      <div
        className="asof"
        role="group"
        aria-label={t.common.asOfGroup}
        data-testid="asof-picker"
      >
        <span className="asof-label" id={labelId}>
          {t.common.asOfLabel}
        </span>
        <DateInput
          value={draft}
          onChange={setDraft}
          onPick={commit}
          aria-labelledby={labelId}
          aria-describedby={hint ? hintId : undefined}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && commit((e.target as HTMLInputElement).value)
          }
          data-testid="asof-input"
          min={bounds.min}
          max={bounds.max}
        />
        <div className="pill-group">
          <button
            type="button"
            className={cx("pill", isToday && "on")}
            aria-pressed={isToday}
            onClick={() => onChange(null)}
            data-testid="asof-today"
          >
            {t.common.today}
          </button>
          {presets.map(({ years, target, on }) => (
            <button
              key={years}
              type="button"
              className={cx("pill", on && "on")}
              aria-pressed={on}
              onClick={() => pick(target)}
              data-testid={`asof-${years}y`}
            >
              {t.common.plusYears(years)}
            </button>
          ))}
        </div>
      </div>
      {hint && (
        <div className="asof-foot">
          <span className="asof-hint" id={hintId} data-testid="asof-hint">
            {hint}
          </span>
        </div>
      )}
    </>
  );
}
