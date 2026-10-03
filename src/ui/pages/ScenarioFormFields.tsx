// Field groups pulled out of ScenarioForm.tsx to shrink its render tree. Pure
// presentation — no logic beyond what ScenarioForm.tsx already computed.
import { Field, TextInput } from "../components/forms";
import { fmtPct } from "../../lib/format";
import {
  OVERRIDE_KEYS,
  overrideLabel,
  type LevelKey,
} from "../model/scenarioForm";
import type { Assumptions } from "../../engine";
import { useT } from "../hooks/useT";

/** The five permanent level-override fields (appreciation, rent indexation, etc). */
export function LevelOverrideFields({
  assumptions,
  values,
  errors,
  onChange,
}: {
  assumptions: Assumptions;
  values: Record<LevelKey, string>;
  errors: Record<string, string>;
  onChange: (key: LevelKey, v: string) => void;
}) {
  const t = useT();
  return (
    <>
      {OVERRIDE_KEYS.map((key) => (
        <Field
          key={key}
          label={overrideLabel(t, key)}
          error={errors[key]}
          help={t.scenarios.baseValue(fmtPct(assumptions[key]))}
        >
          <TextInput
            value={values[key]}
            onChange={(v) => onChange(key, v)}
            suffix="%"
            inputMode="decimal"
            placeholder={t.scenarios.inherit}
          />
        </Field>
      ))}
    </>
  );
}

/**
 * A temporary shock's delta + duration pair — the inflation-shock and rate-shock
 * blocks are structurally identical, parameterized here by label/value/error/onChange.
 */
export function ShockPairFields({
  deltaLabel,
  deltaHelp,
  deltaValue,
  deltaError,
  onDeltaChange,
  yearsValue,
  yearsError,
  onYearsChange,
  defaultShockYears,
}: {
  deltaLabel: string;
  /** Each shock says where it starts: the rate shock at each loan's refix (ADR 0100). */
  deltaHelp: string;
  deltaValue: string;
  deltaError: string | undefined;
  onDeltaChange: (v: string) => void;
  yearsValue: string;
  yearsError: string | undefined;
  onYearsChange: (v: string) => void;
  defaultShockYears: number;
}) {
  const t = useT();
  return (
    <>
      <Field label={deltaLabel} error={deltaError} help={deltaHelp}>
        <TextInput
          value={deltaValue}
          onChange={onDeltaChange}
          suffix={t.scenarios.ppSuffix}
          inputMode="decimal"
          placeholder={t.scenarios.none}
        />
      </Field>
      <Field
        label={t.scenarios.forYears}
        error={yearsError}
        help={t.scenarios.defaultYears(defaultShockYears)}
      >
        <TextInput
          value={yearsValue}
          onChange={onYearsChange}
          inputMode="numeric"
          placeholder={String(defaultShockYears)}
        />
      </Field>
    </>
  );
}
