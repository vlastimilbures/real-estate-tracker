// The Scenarios page's panels: the stress presets and the saved-scenario list. Pure
// presentation: the state and actions are useScenariosPage's.
import { useId, useState, type ReactNode } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { DisclosureButton } from "../components/Disclosure";
import { HelpText } from "../components/HelpText";
import { InfoTip } from "../components/InfoTip";
import { Panel, Button, SegmentedToggle } from "../components/primitives";
import { ConfirmRow } from "../components/ConfirmRow";
import { RowActions, WriteRowAction } from "../components/RowActions";
import { MAX_COMPARE } from "../../state/uiStore";
import type { Scenario, ScenarioOverrides } from "../../engine";
import type {
  ScenarioListActions,
  ScenarioListView,
} from "../hooks/useScenariosPage";
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

/** The stress presets: one click saves a scenario (ADR 0101, 0106, 0220). */
export function PresetBar({
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
        <div className="row row-s2">
          {RATE_LEVELS_PP.map((pp) =>
            button(String(pp), t.scenarios.plusPp(pp), ratePreset(pp, t)),
          )}
        </div>
      </div>

      <div className="preset-group">
        <span className="preset-label">{t.scenarios.inflationShock}</span>
        <div className="row row-s2">
          {INFLATION_LEVELS_PP.map((pp) =>
            button(String(pp), t.scenarios.plusPp(pp), inflationPreset(pp, t)),
          )}
        </div>
      </div>

      <div className="preset-group">
        <span className="preset-label">{t.scenarios.priceCrash}</span>
        {/* The timing is a setting the level buttons use (ADR 0101); it saves
              nothing, so it stays usable while a save runs. */}
        <div className="row row-s2">
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
        <div className="row row-s2">
          {CRASH_LEVELS.map((l) => {
            const p = crashPreset(l, crashAtYear, t);
            return button(l.label, `${l.label}${suffix}`, p, crashTitle(p));
          })}
        </div>
      </div>

      <div className="preset-group">
        <span className="preset-label">{t.scenarios.combined}</span>
        <div className="row row-s2">
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

export function ScenarioListPanel({
  list: { scenarios, baseOn, selectedIds, busy, reachText },
  actions,
  presets,
}: {
  list: ScenarioListView;
  actions: ScenarioListActions;
  /** The "Add from preset" disclosure and the preset bar it opens under the list
   *  (ADR 0220); its open state is the page's (ADR 0106). */
  presets?: { open: boolean; onToggle: () => void; bar: ReactNode } | undefined;
}) {
  const t = useT();
  const presetsId = useId();
  // Delete asks inline first, like every other delete in the app.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const deleteButton = (item: Scenario) => (
    <WriteRowAction
      icon={Trash2}
      label={t.common.delete}
      danger
      disabled={busy}
      onClick={() => setConfirmingId(item.id)}
    />
  );
  const confirmDelete = (item: Scenario) =>
    confirmingId === item.id && (
      <div className="scenario-confirm">
        <ConfirmRow
          message={t.scenarios.confirmDelete(item.name)}
          confirmLabel={t.common.yesDelete}
          busyLabel={t.common.deleting}
          onConfirm={async () => {
            // Close only once the delete landed; a failure stays shown here.
            const result = await actions.remove(item);
            if (result.ok) setConfirmingId(null);
            return result;
          }}
          onCancel={() => setConfirmingId(null)}
        />
      </div>
    );
  // Only saved scenarios that are ticked: an id not yet pruned is not counted.
  const compared = scenarios.filter((s) => selectedIds.includes(s.id)).length;
  return (
    <Panel
      title={t.scenarios.listTitle}
      hint={t.scenarios.comparedOf(compared, MAX_COMPARE)}
      help={<HelpText>{t.scenarios.listHint(MAX_COMPARE)}</HelpText>}
      action={
        presets && (
          <span className="head-toggle">
            <DisclosureButton
              open={presets.open}
              controls={presetsId}
              onToggle={presets.onToggle}
            >
              {t.scenarios.addFromPreset}
            </DisclosureButton>
          </span>
        )
      }
    >
      {/* Above the list, so a saved preset's new row never moves the buttons under the
          pointer, and the presets come before the rows in Tab order (ADR 0220 §3). */}
      {presets && (
        <div id={presetsId} className="preset-drawer" hidden={!presets.open}>
          <div className="subhead-row">
            <h3 className="panel-subhead">{t.scenarios.presetsTitle}</h3>
            <InfoTip topic={t.scenarios.presetsTitle}>
              {t.scenarios.presetsHint(DEFAULT_SHOCK_YEARS)}
            </InfoTip>
          </div>
          {presets.bar}
        </div>
      )}
      <div className="scenario-list-wrap">
        <ul className="scenario-list">
          <li className="scenario-row">
            <label className="scenario-pick">
              <input
                type="checkbox"
                checked={baseOn}
                onChange={actions.toggleBase}
              />
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
                    selectedIds.length >= MAX_COMPARE
                  }
                  onChange={() => actions.toggle(s.id)}
                />
                <span className="scenario-name">{s.name}</span>
              </label>
              <span className="scenario-summary">
                {summarize(s, t, reachText?.(s.id))}
              </span>
              <span className="scenario-actions">
                <RowActions>
                  <WriteRowAction
                    icon={Pencil}
                    label={t.common.edit}
                    onClick={() => actions.edit(s)}
                  />
                  <WriteRowAction
                    icon={Copy}
                    label={t.scenarios.duplicate}
                    disabled={busy}
                    onClick={() => actions.duplicate(s)}
                  />
                  {deleteButton(s)}
                </RowActions>
              </span>
              {confirmDelete(s)}
            </li>
          ))}
          {scenarios.length === 0 && (
            <li className="scenario-empty">{t.scenarios.emptyList}</li>
          )}
        </ul>
      </div>
    </Panel>
  );
}
