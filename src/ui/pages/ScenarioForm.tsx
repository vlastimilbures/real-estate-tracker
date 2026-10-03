// Create/edit modal for a named scenario: five permanent level overrides plus
// temporary rate/inflation shocks and a permanent value crash. Extracted from
// Scenarios.tsx; produces a Scenario via onSubmit and never touches portfolio data.
import { useState } from "react";
import { Button } from "../components/primitives";
import { Modal } from "../components/Modal";
import { Field, TextInput } from "../components/forms";
import { percentDraft } from "../model/formParse";
import { fmtDate } from "../../lib/format";
import { isDirty } from "../model/dirty";
import {
  parseScenarioDraft,
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
  onSubmit: (s: Scenario) => void;
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

  function set<K extends keyof ScenarioDraftFields>(k: K, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function submit() {
    const { errors: errs, name, overrides } = parseScenarioDraft(draft, t);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit({
      id: scenario?.id ?? crypto.randomUUID(),
      name,
      overrides,
      createdAt: scenario?.createdAt ?? new Date(),
    });
  }

  return (
    <Modal
      titleId="scenario-form-modal-title"
      title={
        scenario ? t.scenarios.editTitle(scenario.name) : t.scenarios.newTitle
      }
      onClose={onCancel}
      closeLabel={t.common.close}
      onSubmit={submit}
      dirty={isDirty(initialDraft, draft)}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary">
            {scenario ? t.common.save : t.common.create}
          </Button>
        </>
      }
    >
      <div className="record-form">
        <p className="form-hint">{t.scenarios.formHint}</p>
        <div className="form-grid">
          <Field label={t.scenarios.name} error={errors.name}>
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
      </div>
    </Modal>
  );
}
