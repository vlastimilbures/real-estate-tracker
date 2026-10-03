// Sub-components pulled out of Scenarios.tsx to shrink its render tree. Pure
// presentation — no logic beyond what Scenarios.tsx already computed.
import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Panel, Button, SegmentedToggle } from "../components/primitives";
import { DeleteConfirmRow } from "../components/EntityPanelParts";
import { rate, type Scenario, type ScenarioOverrides } from "../../engine";
import { useT } from "../hooks/useT";
import {
  combinedPreset,
  summarize,
  type CombinedRecipe,
} from "../model/scenarios";
import { fmtDate } from "../../lib/format";
import { DEFAULT_SHOCK_YEARS } from "./ScenarioForm";

// Labels are built from these numbers in the UI language at render (UX-034).
const RATE_LEVELS = [
  { pp: 2, delta: "0.02" },
  { pp: 4, delta: "0.04" },
  { pp: 6, delta: "0.06" },
];
const INFLATION_LEVELS = [
  { pp: 3, delta: "0.03" },
  { pp: 6, delta: "0.06" },
  { pp: 9, delta: "0.09" },
];
const CRASH_LEVELS = [
  { label: "−10%", pct: "0.1" },
  { label: "−20%", pct: "0.2" },
  { label: "−35%", pct: "0.35" },
];
const CRASH_TIMINGS = [0, 5, 10];
// The fixed combined recipes (ADR 0104).
const COMBINED_LEVELS: CombinedRecipe[] = [
  {
    level: (t) => t.scenarios.mild,
    rate: { pp: 2, delta: "0.02" },
    crash: { label: "−10%", pct: "0.1" },
  },
  {
    level: (t) => t.scenarios.severe,
    rate: { pp: 4, delta: "0.04" },
    inflation: { pp: 3, delta: "0.03" },
    crash: { label: "−20%", pct: "0.2" },
  },
];

export function StressPresetsPanel({
  open,
  onToggleOpen,
  busy,
  baseDate,
  crashAtYear,
  onCrashAtYearChange,
  onAddPreset,
}: {
  /** Collapsed, the panel shows a one-line summary and no buttons (ADR 0106). */
  open: boolean;
  onToggleOpen: () => void;
  busy: boolean;
  /** Projection start: crash timing 0 (ADR 0090). */
  baseDate: Date;
  crashAtYear: number;
  onCrashAtYearChange: (atYear: number) => void;
  onAddPreset: (name: string, overrides: ScenarioOverrides) => void;
}) {
  const t = useT();
  const bodyId = useId();
  return (
    <Panel
      title={t.scenarios.presetsTitle}
      hint={t.scenarios.presetsHint(DEFAULT_SHOCK_YEARS)}
      action={
        <span className="preset-toggle">
          <Button
            size="sm"
            variant="ghost"
            icon={open ? ChevronUp : ChevronDown}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={onToggleOpen}
          >
            {open ? t.scenarios.hidePresets : t.scenarios.showPresets}
          </Button>
        </span>
      }
    >
      <div id={bodyId}>
        {open ? (
          <PresetBar
            busy={busy}
            baseDate={baseDate}
            crashAtYear={crashAtYear}
            onCrashAtYearChange={onCrashAtYearChange}
            onAddPreset={onAddPreset}
          />
        ) : (
          <p className="preset-collapsed">
            {t.scenarios.presetsCollapsedSummary}
          </p>
        )}
      </div>
    </Panel>
  );
}

function PresetBar({
  busy,
  baseDate,
  crashAtYear,
  onCrashAtYearChange,
  onAddPreset,
}: {
  busy: boolean;
  baseDate: Date;
  crashAtYear: number;
  onCrashAtYearChange: (atYear: number) => void;
  onAddPreset: (name: string, overrides: ScenarioOverrides) => void;
}) {
  const t = useT();
  return (
    <div className="preset-bar">
      <div className="preset-group">
        <span className="preset-label">{t.scenarios.rateShockAtRefix}</span>
        <div className="row" style={{ gap: "var(--s2)" }}>
          {RATE_LEVELS.map((l) => (
            <Button
              key={l.pp}
              size="sm"
              disabled={busy}
              title={t.scenarios.rateForYears(
                t.scenarios.plusPp(l.pp),
                DEFAULT_SHOCK_YEARS,
              )}
              onClick={() =>
                onAddPreset(
                  t.scenarios.rateForYears(
                    t.scenarios.plusPp(l.pp),
                    DEFAULT_SHOCK_YEARS,
                  ),
                  {
                    rateShock: {
                      deltaPa: rate(l.delta),
                      durationYears: DEFAULT_SHOCK_YEARS,
                    },
                  },
                )
              }
            >
              {t.scenarios.plusPp(l.pp)}
            </Button>
          ))}
        </div>
      </div>

      <div className="preset-group">
        <span className="preset-label">{t.scenarios.inflationShock}</span>
        <div className="row" style={{ gap: "var(--s2)" }}>
          {INFLATION_LEVELS.map((l) => (
            <Button
              key={l.pp}
              size="sm"
              disabled={busy}
              title={t.scenarios.inflForYears(
                t.scenarios.plusPp(l.pp),
                DEFAULT_SHOCK_YEARS,
              )}
              onClick={() =>
                onAddPreset(
                  t.scenarios.inflForYears(
                    t.scenarios.plusPp(l.pp),
                    DEFAULT_SHOCK_YEARS,
                  ),
                  {
                    inflationShock: {
                      deltaPa: rate(l.delta),
                      durationYears: DEFAULT_SHOCK_YEARS,
                    },
                  },
                )
              }
            >
              {t.scenarios.plusPp(l.pp)}
            </Button>
          ))}
        </div>
      </div>

      <div className="preset-group">
        <span className="preset-label">{t.scenarios.priceCrash}</span>
        {/* The timing is a setting the level buttons use (ADR 0101); it saves
              nothing, so it stays usable while a save runs. */}
        <div className="row" style={{ gap: "var(--s2)" }}>
          <span className="preset-when">{t.scenarios.crashWhen}</span>
          <SegmentedToggle
            ariaLabel={t.scenarios.crashWhen}
            options={CRASH_TIMINGS.map((atYear) => ({
              value: String(atYear),
              label:
                atYear === 0 ? t.scenarios.atStart : t.common.plusYears(atYear),
            }))}
            value={String(crashAtYear)}
            onChange={(v) => onCrashAtYearChange(Number(v))}
          />
        </div>
        <div className="row" style={{ gap: "var(--s2)" }}>
          {CRASH_LEVELS.map((l) => {
            const suffix =
              crashAtYear === 0
                ? ""
                : t.scenarios.crashAt(t.common.plusYears(crashAtYear));
            const presetName = t.scenarios.crashTitle(l.label, suffix);
            return (
              <Button
                key={l.label}
                size="sm"
                disabled={busy}
                title={
                  crashAtYear === 0
                    ? `${presetName} · ${t.scenarios.atStartTitle(fmtDate(baseDate))}`
                    : presetName
                }
                onClick={() =>
                  onAddPreset(presetName, {
                    valueShock: {
                      pct: rate(l.pct),
                      atYear: crashAtYear,
                    },
                  })
                }
              >
                {`${l.label}${suffix}`}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="preset-group">
        <span className="preset-label">{t.scenarios.combined}</span>
        <div className="row" style={{ gap: "var(--s2)" }}>
          {COMBINED_LEVELS.map((r) => {
            const { name, overrides } = combinedPreset(r, crashAtYear, t);
            const suffix =
              crashAtYear === 0
                ? ""
                : t.scenarios.crashAt(t.common.plusYears(crashAtYear));
            return (
              <Button
                key={r.crash.label}
                size="sm"
                disabled={busy}
                title={
                  crashAtYear === 0
                    ? `${name} · ${t.scenarios.atStartTitle(fmtDate(baseDate))}`
                    : name
                }
                onClick={() => onAddPreset(name, overrides)}
              >
                {`${r.level(t)}${suffix}`}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ScenarioListPanel({
  scenarios,
  baseOn,
  onToggleBase,
  selectedIds,
  maxCompare,
  onToggle,
  busy,
  onEdit,
  onDuplicate,
  onDelete,
  reachText,
}: {
  scenarios: Scenario[];
  baseOn: boolean;
  onToggleBase: () => void;
  selectedIds: string[];
  maxCompare: number;
  onToggle: (id: string) => void;
  busy: boolean;
  onEdit: (s: Scenario) => void;
  onDuplicate: (s: Scenario) => void;
  onDelete: (s: Scenario) => void;
  /** Which loans the scenario's rate shock hits (ADR 0100). */
  reachText?: (id: string) => string | undefined;
}) {
  const t = useT();
  // UX-020: Delete asks inline first, like every other delete in the app.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  return (
    <Panel
      title={t.scenarios.listTitle}
      hint={t.scenarios.listHint(maxCompare)}
    >
      <ul className="scenario-list">
        <li className="scenario-row">
          <label className="scenario-pick">
            <input type="checkbox" checked={baseOn} onChange={onToggleBase} />
            <span className="scenario-name">{t.scenarios.base}</span>
          </label>
          <span className="scenario-summary">
            {t.scenarios.savedAssumptions}
          </span>
          <span className="scenario-actions" />
        </li>
        {scenarios.map((s) => (
          <li className="scenario-row" key={s.id}>
            <label className="scenario-pick">
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                disabled={
                  !selectedIds.includes(s.id) &&
                  selectedIds.length >= maxCompare
                }
                onChange={() => onToggle(s.id)}
              />
              <span className="scenario-name">{s.name}</span>
            </label>
            <span className="scenario-summary">
              {summarize(s, t, reachText?.(s.id))}
            </span>
            <span className="scenario-actions">
              <Button size="sm" variant="ghost" onClick={() => onEdit(s)}>
                {t.common.edit}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onDuplicate(s)}
              >
                {t.scenarios.duplicate}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => setConfirmingId(s.id)}
              >
                {t.common.delete}
              </Button>
            </span>
            {confirmingId === s.id && (
              <div className="scenario-confirm">
                <DeleteConfirmRow
                  busy={busy}
                  message={t.scenarios.confirmDelete(s.name)}
                  onConfirm={() => {
                    setConfirmingId(null);
                    onDelete(s);
                  }}
                  onCancel={() => setConfirmingId(null)}
                />
              </div>
            )}
          </li>
        ))}
        {scenarios.length === 0 && (
          <li className="scenario-empty">{t.scenarios.emptyList}</li>
        )}
      </ul>
    </Panel>
  );
}
