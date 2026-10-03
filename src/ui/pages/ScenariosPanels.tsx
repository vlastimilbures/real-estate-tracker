// Sub-components pulled out of Scenarios.tsx to shrink its render tree. Pure
// presentation — no logic beyond what Scenarios.tsx already computed.
import { useState } from "react";
import { Panel, Button } from "../components/primitives";
import { DeleteConfirmRow } from "../components/EntityPanelParts";
import { rate, type Scenario, type ScenarioOverrides } from "../../engine";
import { useT } from "../hooks/useT";
import { summarize } from "../model/scenarios";
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

export function StressPresetsPanel({
  busy,
  crashAtYear,
  onCrashAtYearChange,
  onAddPreset,
}: {
  busy: boolean;
  crashAtYear: number;
  onCrashAtYearChange: (atYear: number) => void;
  onAddPreset: (name: string, overrides: ScenarioOverrides) => void;
}) {
  const t = useT();
  return (
    <Panel
      title={t.scenarios.presetsTitle}
      hint={t.scenarios.presetsHint(DEFAULT_SHOCK_YEARS)}
    >
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
          <div className="row" style={{ gap: "var(--s2)" }}>
            {CRASH_TIMINGS.map((atYear) => {
              const tmLabel =
                atYear === 0 ? t.common.today : t.common.plusYears(atYear);
              return (
                <Button
                  key={atYear}
                  size="sm"
                  variant={crashAtYear === atYear ? "primary" : "ghost"}
                  onClick={() => onCrashAtYearChange(atYear)}
                  title={t.scenarios.applyCrashAt(tmLabel)}
                >
                  {tmLabel}
                </Button>
              );
            })}
            <span className="preset-sep" />
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
                  title={presetName}
                  onClick={() =>
                    onAddPreset(presetName, {
                      valueShock: {
                        pct: rate(l.pct),
                        atYear: crashAtYear,
                      },
                    })
                  }
                >
                  {l.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
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
            <span className="scenario-summary">{summarize(s, t)}</span>
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
