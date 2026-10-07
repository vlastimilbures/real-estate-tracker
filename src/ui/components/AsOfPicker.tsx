// "As of" date picker for the Dashboard / Property detail snapshot. A dd.mm.yyyy
// text input (app convention) plus quick presets. `value === null` means "today".
// Presentational: it emits Date | null (null = Today) and keeps the date inside the
// projection window (UX-059, D-19). It shows the date the page computes for, by the one
// resolver (ADR 0150): a stale stored value or a future base date shows the clamped date.
import { useState, useId } from "react";
import { parseDate, dateDraft } from "../model/formParse";
import { todayUtc } from "../../lib/day";
import { useT } from "../hooks/useT";
import { DateInput } from "./DateInput";
import {
  clampAsOf,
  plusYears,
  resolveAsOf,
  type AsOfBounds,
} from "../model/asOf";

export function AsOfPicker({
  value,
  onChange,
  anchor,
  bounds,
  hint,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
  /** The projection window; a date outside it moves to its nearest end. */
  bounds: AsOfBounds;
  // Date the "+Ny" presets step from. Defaults to today; every caller uses the
  // default so presets always mean "N years from now", not from a stored date.
  anchor?: Date;
  /** How the date maps to what the page shows (ADR 0088); none at Today. */
  hint?: string | null;
}) {
  const t = useT();
  const labelId = useId();
  const hintId = useId();
  const today = todayUtc();
  const presetAnchor = anchor ?? today;
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
  const commit = (raw: string) => {
    const parsed = parseDate(raw);
    if (parsed) pick(parsed);
    else setDraft(dateDraft(effective)); // revert invalid input
  };

  // Highlight a preset chip when the shown date equals its target. Reuse the exact
  // plusYears(presetAnchor, n) the onClick uses so they can never drift.
  const is1y =
    value !== null &&
    effective.getTime() === plusYears(presetAnchor, 1).getTime();
  const is5y =
    value !== null &&
    effective.getTime() === plusYears(presetAnchor, 5).getTime();

  return (
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
          className={`pill${isToday ? " on" : ""}`}
          aria-pressed={isToday}
          onClick={() => onChange(null)}
          data-testid="asof-today"
        >
          {t.common.today}
        </button>
        <button
          type="button"
          className={`pill${is1y ? " on" : ""}`}
          aria-pressed={is1y}
          onClick={() => pick(plusYears(presetAnchor, 1))}
          data-testid="asof-1y"
        >
          {t.common.plusYears(1)}
        </button>
        <button
          type="button"
          className={`pill${is5y ? " on" : ""}`}
          aria-pressed={is5y}
          onClick={() => pick(plusYears(presetAnchor, 5))}
          data-testid="asof-5y"
        >
          {t.common.plusYears(5)}
        </button>
      </div>
      {hint && (
        <span className="asof-hint" id={hintId} data-testid="asof-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
