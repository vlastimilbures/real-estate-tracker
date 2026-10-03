import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { isDirty } from "../model/dirty";
import { Panel, Button, Toast, EmptyState } from "../components/primitives";
import { FolderOpen } from "lucide-react";
import { Field, TextInput } from "../components/forms";
import { DateInput } from "../components/DateInput";
import {
  collectValues,
  FORM_PARSERS,
  fieldHint,
  percentDraft,
  moneyDraft,
  dateDraft,
  type CollectRules,
  type FieldSpec,
} from "../model/formParse";
import { INT_RANGES } from "../../lib/intRanges";
import type { Assumptions } from "../../engine";
import { currencySymbol } from "../../lib/currency";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { formWriteErrors } from "../model/writeError";
import { useToast } from "../hooks/useToast";

function buildSpecs(t: Dictionary) {
  const a = t.assumptions;
  return {
    drivers: [
      {
        name: "baseDate",
        label: a.baseDate,
        kind: "date",
        help: a.baseDateHelp,
      },
      {
        name: "horizonYears",
        label: a.horizon,
        kind: "int",
        suffix: t.common.yearsSuffix,
        range: INT_RANGES.horizonYears,
      },
      {
        name: "appreciationPa",
        label: a.appreciation,
        kind: "pct",
        suffix: "%",
      },
      {
        name: "rentIndexationPa",
        label: a.rentIndexation,
        kind: "pct",
        suffix: "%",
      },
      { name: "inflationPa", label: a.inflation, kind: "pct", suffix: "%" },
      { name: "vacancyAllowance", label: a.vacancy, kind: "pct", suffix: "%" },
      {
        name: "postFixationResetRatePa",
        label: a.postFixationReset,
        kind: "pct",
        suffix: "%",
      },
    ],
    defaults: [
      {
        name: "propertyTaxYr",
        label: a.propertyTax,
        kind: "money",
        suffix: currencySymbol(),
      },
      {
        name: "insuranceYr",
        label: a.insurance,
        kind: "money",
        suffix: currencySymbol(),
      },
      {
        name: "svjMonthly",
        label: a.svj,
        kind: "money",
        suffix: currencySymbol(),
      },
      {
        name: "otherYr",
        label: a.other,
        kind: "money",
        suffix: currencySymbol(),
      },
      { name: "mgmtPctRent", label: a.mgmt, kind: "pct", suffix: "%" },
      { name: "maintPctRent", label: a.maint, kind: "pct", suffix: "%" },
    ],
  } as const;
}

/** Every field is required; money defaults are 0 or more, as in RecordForm (ADR 0075). */
function assumptionRules(t: Dictionary): CollectRules {
  return {
    parsers: FORM_PARSERS,
    blank: (spec) => fieldHint(t, spec),
    invalid: (spec) => fieldHint(t, spec),
  };
}

function toDraft(a: Assumptions): Record<string, string> {
  return {
    baseDate: dateDraft(a.baseDate),
    horizonYears: String(a.horizonYears),
    appreciationPa: percentDraft(a.appreciationPa),
    rentIndexationPa: percentDraft(a.rentIndexationPa),
    inflationPa: percentDraft(a.inflationPa),
    vacancyAllowance: percentDraft(a.vacancyAllowance),
    postFixationResetRatePa: percentDraft(a.postFixationResetRatePa),
    propertyTaxYr: moneyDraft(a.defaults.propertyTaxYr),
    insuranceYr: moneyDraft(a.defaults.insuranceYr),
    svjMonthly: moneyDraft(a.defaults.svjMonthly),
    otherYr: moneyDraft(a.defaults.otherYr),
    mgmtPctRent: percentDraft(a.defaults.mgmtPctRent),
    maintPctRent: percentDraft(a.defaults.maintPctRent),
  };
}

/** Form body without an AppShell — embedded in the Settings page sub-tabs. */
export function AssumptionsPanel() {
  const t = useT();
  const { drivers: DRIVERS, defaults: DEFAULTS } = buildSpecs(t);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const saveAssumptions = usePortfolioStore((s) => s.saveAssumptions);
  const initial = useMemo(
    () => (assumptions ? toDraft(assumptions) : null),
    [assumptions],
  );
  const [draft, setDraft] = useState<Record<string, string> | null>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast, showToast } = useToast();
  const setUnsavedChanges = useUiStore((s) => s.setUnsavedChanges);
  const [saving, setSaving] = useState(false);
  // A failed save keeps the input and says so until the next edit (ADR 0095).
  const [failed, setFailed] = useState(false);
  // Bumped on a failed save so the error summary takes focus once it renders.
  const [summaryFocus, setSummaryFocus] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const fieldId = (name: string) => `${formId}-${name}`;
  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus();
  }, [summaryFocus]);

  // re-sync when store loads / changes underneath
  const current = draft ?? initial;
  // Unsaved edits hold back navigation away from this tab (UX-030).
  const unsaved = Boolean(initial && current && isDirty(initial, current));
  useEffect(() => {
    setUnsavedChanges("assumptions", unsaved);
  }, [unsaved, setUnsavedChanges]);
  useEffect(
    () => () => setUnsavedChanges("assumptions", false),
    [setUnsavedChanges],
  );
  if (!assumptions || !current) {
    return (
      <EmptyState title={t.common.noPortfolioTitle} icon={FolderOpen}>
        {t.common.noPortfolioBody}
      </EmptyState>
    );
  }

  const set = (name: string, v: string) => {
    setDraft({ ...current, [name]: v });
    setFailed(false);
  };

  /** Show a failed save: keep the input, and focus the summary when fields are named. */
  const fail = (fieldErrors: Record<string, string>) => {
    setErrors(fieldErrors);
    setFailed(true);
    if (Object.keys(fieldErrors).length > 0) setSummaryFocus((n) => n + 1);
  };

  const onDiscard = () => {
    setDraft(null);
    setErrors({});
    setFailed(false);
  };

  const onSave = () => {
    if (saving) return;
    const { values: v, errors: errs } = collectValues(
      [...DRIVERS, ...DEFAULTS],
      current,
      assumptionRules(t),
    );
    if (Object.keys(errs).length > 0) {
      fail(errs);
      return;
    }
    setErrors({});

    const next: Assumptions = {
      baseDate: v.baseDate,
      horizonYears: v.horizonYears,
      appreciationPa: v.appreciationPa,
      rentIndexationPa: v.rentIndexationPa,
      inflationPa: v.inflationPa,
      vacancyAllowance: v.vacancyAllowance,
      postFixationResetRatePa: v.postFixationResetRatePa,
      defaults: {
        propertyTaxYr: v.propertyTaxYr,
        insuranceYr: v.insuranceYr,
        svjMonthly: v.svjMonthly,
        otherYr: v.otherYr,
        mgmtPctRent: v.mgmtPctRent,
        maintPctRent: v.maintPctRent,
      },
    };
    // On failure the AppShell banner shows the message and a broken rule also marks
    // its field (UX-047); the success toast shows only when the write landed.
    setSaving(true);
    void saveAssumptions(next).then((result) => {
      setSaving(false);
      if (!result.ok) {
        const names = [...DRIVERS, ...DEFAULTS].map((s) => s.name);
        fail(formWriteErrors(t, result.error, names).fieldErrors);
        return;
      }
      // Saved: show the stored values again, so the form is no longer "unsaved".
      setDraft(null);
      setFailed(false);
      showToast(t.assumptions.saved);
    });
  };

  const invalid = [...DRIVERS, ...DEFAULTS].filter((s) => errors[s.name]);
  const stateText = failed
    ? t.common.saveFailedKept
    : unsaved
      ? t.common.unsavedChanges
      : t.common.allChangesSaved;

  const renderField = (spec: FieldSpec) => (
    <Field
      key={spec.name}
      id={fieldId(spec.name)}
      label={spec.label}
      required
      error={errors[spec.name]}
      help={spec.help}
    >
      {spec.kind === "date" ? (
        <DateInput
          value={current[spec.name] ?? ""}
          onChange={(v) => set(spec.name, v)}
        />
      ) : (
        <TextInput
          value={current[spec.name] ?? ""}
          onChange={(v) => set(spec.name, v)}
          suffix={spec.suffix}
          inputMode="decimal"
        />
      )}
    </Field>
  );

  return (
    <form
      className="form-contents assumptions-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <p className="hint">{t.assumptions.scenariosHint}</p>
      <Panel title={t.assumptions.driversTitle}>
        <div className="form-grid">{DRIVERS.map(renderField)}</div>
      </Panel>
      <Panel
        title={t.assumptions.defaultsTitle}
        hint={t.assumptions.defaultsHint}
      >
        <div className="form-grid">{DEFAULTS.map(renderField)}</div>
      </Panel>
      {invalid.length > 0 && (
        <div
          className="error-summary"
          role="group"
          aria-labelledby={`${formId}-summary`}
          tabIndex={-1}
          ref={summaryRef}
        >
          <p id={`${formId}-summary`} className="error-text">
            {t.common.fieldsNeedAttention(invalid.length)}
          </p>
          <ul>
            {invalid.map((spec) => (
              <li key={spec.name}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    document.getElementById(fieldId(spec.name))?.focus()
                  }
                >
                  {spec.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* One Save/Discard row for the whole form, kept in view (ADR 0095). */}
      <div className="form-actions sticky-actions">
        <span className={`form-state${failed ? " failed" : ""}`} role="status">
          {stateText}
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={onDiscard}
          disabled={!unsaved || saving}
        >
          {t.common.discardChanges}
        </Button>
        <Button type="submit" variant="primary" disabled={!unsaved || saving}>
          {saving ? t.common.saving : t.common.saveChanges}
        </Button>
      </div>
      {toast && <Toast message={toast} />}
    </form>
  );
}
