// Sub-components pulled out of Scenarios.tsx to shrink its render tree. Pure
// presentation — no logic beyond what Scenarios.tsx already computed.
import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Panel, Button, SegmentedToggle } from "../components/primitives";
import { ConfirmRow } from "../components/EntityPanelParts";
import type { MutationResult } from "../../state/portfolioStore";
import type { Scenario, ScenarioOverrides } from "../../engine";
import { useT } from "../hooks/useT";
import {
  COMBINED_RECIPES,
  CRASH_LEVELS,
  CRASH_TIMINGS,
  INFLATION_LEVELS_PP,
  RATE_LEVELS_PP,
  combinedPreset,
  crashPreset,
  crashSuffix,
  inflationPreset,
  ratePreset,
  summarize,
  type Preset,
} from "../model/scenarios";
import { fmtDate } from "../../lib/format";
import { DEFAULT_SHOCK_YEARS } from "./ScenarioForm";

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
  const suffix = crashSuffix(crashAtYear, t);
  // A crash at the start names the date it falls on (ADR 0101).
  const crashTitle = (p: Preset) =>
    crashAtYear === 0
      ? `${p.name} · ${t.scenarios.atStartTitle(fmtDate(baseDate))}`
      : p.name;
  const button = (key: string, label: string, p: Preset, title = p.name) => (
    <Button
      key={key}
      size="sm"
      disabled={busy}
      title={title}
      onClick={() => onAddPreset(p.name, p.overrides)}
    >
      {label}
    </Button>
  );
  return (
    <div className="preset-bar">
      <div className="preset-group">
        <span className="preset-label">{t.scenarios.rateShockAtRefix}</span>
        <div className="row" style={{ gap: "var(--s2)" }}>
          {RATE_LEVELS_PP.map((pp) =>
            button(String(pp), t.scenarios.plusPp(pp), ratePreset(pp, t)),
          )}
        </div>
      </div>

      <div className="preset-group">
        <span className="preset-label">{t.scenarios.inflationShock}</span>
        <div className="row" style={{ gap: "var(--s2)" }}>
          {INFLATION_LEVELS_PP.map((pp) =>
            button(String(pp), t.scenarios.plusPp(pp), inflationPreset(pp, t)),
          )}
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
            const p = crashPreset(l, crashAtYear, t);
            return button(l.label, `${l.label}${suffix}`, p, crashTitle(p));
          })}
        </div>
      </div>

      <div className="preset-group">
        <span className="preset-label">{t.scenarios.combined}</span>
        <div className="row" style={{ gap: "var(--s2)" }}>
          {COMBINED_RECIPES.map((r) => {
            const p = combinedPreset(r, crashAtYear, t);
            return button(
              r.crash.label,
              `${r.level(t)}${suffix}`,
              p,
              crashTitle(p),
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A scenario as the list deletes it: a readable one, or a row the app cannot read. */
type Deletable = { id: string; name: string };

export function ScenarioListPanel({
  scenarios,
  unreadable = [],
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
  /** Stored rows the app cannot read (ADR 0123): listed with only Delete. */
  unreadable?: readonly Deletable[];
  baseOn: boolean;
  onToggleBase: () => void;
  selectedIds: string[];
  maxCompare: number;
  onToggle: (id: string) => void;
  busy: boolean;
  onEdit: (s: Scenario) => void;
  onDuplicate: (s: Scenario) => void;
  onDelete: (s: Deletable) => Promise<MutationResult>;
  /** Which loans the scenario's rate shock hits (ADR 0100). */
  reachText?: (id: string) => string | undefined;
}) {
  const t = useT();
  // UX-020: Delete asks inline first, like every other delete in the app. The same
  // button and confirmation serve readable and unreadable rows (ADR 0123).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const deleteButton = (item: Deletable) => (
    <Button
      size="sm"
      variant="danger"
      disabled={busy}
      onClick={() => setConfirmingId(item.id)}
    >
      {t.common.delete}
    </Button>
  );
  const confirmDelete = (item: Deletable) =>
    confirmingId === item.id && (
      <div className="scenario-confirm">
        <ConfirmRow
          message={t.scenarios.confirmDelete(item.name)}
          confirmLabel={t.common.yesDelete}
          busyLabel={t.common.deleting}
          onConfirm={async () => {
            // Close only once the delete landed; a failure stays shown here (UX-050).
            const result = await onDelete(item);
            if (result.ok) setConfirmingId(null);
            return result;
          }}
          onCancel={() => setConfirmingId(null)}
        />
      </div>
    );
  return (
    <Panel
      title={t.scenarios.listTitle}
      hint={t.scenarios.listHint(maxCompare)}
    >
      <div className="scenario-list-wrap">
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
                {deleteButton(s)}
              </span>
              {confirmDelete(s)}
            </li>
          ))}
          {unreadable.map((u) => (
            <li className="scenario-row" key={u.id}>
              <span className="scenario-pick">
                <span className="scenario-name">{u.name}</span>
              </span>
              <span className="scenario-summary">
                {t.scenarios.unreadableRow}
              </span>
              <span className="scenario-actions">{deleteButton(u)}</span>
              {confirmDelete(u)}
            </li>
          ))}
          {scenarios.length === 0 && unreadable.length === 0 && (
            <li className="scenario-empty">{t.scenarios.emptyList}</li>
          )}
        </ul>
      </div>
    </Panel>
  );
}
