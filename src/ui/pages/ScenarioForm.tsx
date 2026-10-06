// Create/edit modal for a named scenario: five permanent level overrides plus
// temporary rate/inflation shocks and a permanent value crash. Extracted from
// Scenarios.tsx; produces a Scenario via onSubmit and never touches portfolio data.
// A refused save stays open with the broken rule on its field (ADR 0123).
import { useState } from "react";
import { Button } from "../components/primitives";
import { Modal } from "../components/Modal";
import { Field, TextInput } from "../components/forms";
import { percentDraft } from "../model/formParse";
import { fmtDate } from "../../lib/format";
import { isDirty } from "../model/dirty";
import {
  parseScenarioDraft,
  scenarioWriteErrors,
  DEFAULT_SHOCK_YEARS,
  type ScenarioDraftFields,
  type LevelKey,
} from "../model/scenarioForm";
import {
  FieldGroup,
  LevelOverrideFields,
  ShockPairFields,
} from "./ScenarioFormFields";
import type { Assumptions, Scenario } from "../../engine";
import { toWriteError, type WriteError } from "../../state/writeError";
import { useT } from "../hooks/useT";

export { DEFAULT_SHOCK_YEARS };

export function ScenarioForm({
  assumptions,
  scenario,
  onSubmit,
  onCancel,
}: {
  assumptions: Assumptions;
  scenario: Scenario | null;
  /** May be async; while it runs the buttons disable, so a second Return cannot save a
   *  second scenario. Resolve to a WriteError to keep the form open with the failure
   *  shown (as RecordForm does). */
  onSubmit: (s: Scenario) => void | WriteError | Promise<void | WriteError>;
  onCancel: () => void;
}) {
  const t = useT();
  const o = scenario?.overrides;
  const [initialDraft] = useState<ScenarioDraftFields>(() => ({
    name: scenario?.name ?? "",
    appreciationPa: percentDraft(o?.appreciationPa),
    rentIndexationPa: percentDraft(o?.rentIndexationPa),
    vacancyAllowance: percentDraft(o?.vacancyAllowance),
    postFixationResetRatePa: percentDraft(o?.postFixationResetRatePa),
    inflationPa: percentDraft(o?.inflationPa),
    inflationShockDelta: percentDraft(o?.inflationShock?.deltaPa),
    inflationShockYears: o?.inflationShock
      ? String(o.inflationShock.durationYears)
      : "",
    rateShockDelta: percentDraft(o?.rateShock?.deltaPa),
    rateShockYears: o?.rateShock ? String(o.rateShock.durationYears) : "",
    valueShockPct: percentDraft(o?.valueShock?.pct),
    valueShockYear: o?.valueShock ? String(o.valueShock.atYear) : "",
  }));
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One id per form, so a retry after a failed save cannot add a second scenario.
  const [id] = useState(() => scenario?.id ?? crypto.randomUUID());

  /** Edit one field; its error goes with the edit (ADR 0141). */
  function set<K extends keyof ScenarioDraftFields>(k: K, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[k];
      return copy;
    });
  }

  async function submit() {
    if (busy) return;
    const { errors: errs, name, overrides } = parseScenarioDraft(draft, t);
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    try {
      let failure: void | WriteError;
      try {
        failure = await onSubmit({ id, name, overrides });
      } catch (e) {
        failure = toWriteError(e);
      }
      if (failure) {
        const split = scenarioWriteErrors(t, failure);
        setErrors(split.fieldErrors);
        setFormError(split.formError);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      titleId="scenario-form-modal-title"
      title={
        scenario ? t.scenarios.editTitle(scenario.name) : t.scenarios.newTitle
      }
      onClose={onCancel}
      closeLabel={t.common.close}
      onSubmit={() => void submit()}
      dirty={isDirty(initialDraft, draft)}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy
              ? t.common.saving
              : scenario
                ? t.common.save
                : t.common.create}
          </Button>
        </>
      }
    >
      <div className="record-form">
        <p className="form-hint">{t.scenarios.formHint}</p>
        <div className="form-grid">
          <Field label={t.scenarios.name} required error={errors.name}>
            <TextInput
              value={draft.name}
              onChange={(v) => set("name", v)}
              placeholder={t.scenarios.namePlaceholder}
            />
          </Field>
        </div>
        <FieldGroup
          legend={t.scenarios.groupLevels}
          help={t.scenarios.groupLevelsHelp}
        >
          <LevelOverrideFields
            assumptions={assumptions}
            values={draft}
            errors={errors}
            onChange={(key: LevelKey, v) => set(key, v)}
          />
        </FieldGroup>
        <FieldGroup
          legend={t.scenarios.groupShocks}
          help={t.scenarios.groupShocksHelp}
        >
          <ShockPairFields
            deltaLabel={t.scenarios.fieldInflationShock}
            deltaHelp={t.scenarios.shockHelp}
            deltaValue={draft.inflationShockDelta}
            deltaError={errors.inflationShockDelta}
            onDeltaChange={(v) => set("inflationShockDelta", v)}
            yearsValue={draft.inflationShockYears}
            yearsError={errors.inflationShockYears}
            onYearsChange={(v) => set("inflationShockYears", v)}
            defaultShockYears={DEFAULT_SHOCK_YEARS}
          />

          <ShockPairFields
            deltaLabel={t.scenarios.fieldRateShock}
            deltaHelp={t.scenarios.rateShockHelp}
            deltaValue={draft.rateShockDelta}
            deltaError={errors.rateShockDelta}
            onDeltaChange={(v) => set("rateShockDelta", v)}
            yearsValue={draft.rateShockYears}
            yearsError={errors.rateShockYears}
            onYearsChange={(v) => set("rateShockYears", v)}
            defaultShockYears={DEFAULT_SHOCK_YEARS}
          />
        </FieldGroup>
        <FieldGroup
          legend={t.scenarios.groupCrash}
          help={t.scenarios.groupCrashHelp}
        >
          <Field
            label={t.scenarios.fieldValueCrash}
            error={errors.valueShockPct}
            help={t.scenarios.permanentCorrection}
          >
            <TextInput
              value={draft.valueShockPct}
              onChange={(v) => set("valueShockPct", v)}
              suffix="%"
              inputMode="decimal"
              placeholder={t.scenarios.none}
            />
          </Field>
          <Field
            label={t.scenarios.atYear}
            error={errors.valueShockYear}
            help={t.scenarios.zeroIsStart(fmtDate(assumptions.baseDate))}
          >
            <TextInput
              value={draft.valueShockYear}
              onChange={(v) => set("valueShockYear", v)}
              inputMode="numeric"
              placeholder="0"
            />
          </Field>
        </FieldGroup>
        {formError && (
          <p className="error-text" role="alert">
            {formError}
          </p>
        )}
      </div>
    </Modal>
  );
}
