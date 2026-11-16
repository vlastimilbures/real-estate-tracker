import { useEffect, useId, useRef } from "react";
import { Panel, Button, EmptyState } from "../components/primitives";
import { FolderOpen } from "lucide-react";
import { Field, TextInput } from "../components/fields";
import { DateInput } from "../components/DateInput";
import type { FieldSpec } from "../model/formParse";
import { useT } from "../hooks/useT";
import { useAssumptionsForm } from "../hooks/useAssumptionsForm";

/** Form body without an AppShell — embedded in the Settings page sub-tabs. */
export function AssumptionsPanel() {
  const t = useT();
  const form = useAssumptionsForm(true);
  const summaryRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const fieldId = (name: string) => `${formId}-${name}`;
  const { summaryFocus } = form;
  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus();
  }, [summaryFocus]);

  const { current, errors, invalid, formError } = form;
  if (!current) {
    return (
      <EmptyState title={t.common.noPortfolioTitle} icon={FolderOpen}>
        {t.common.noPortfolioBody}
      </EmptyState>
    );
  }

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
          onChange={(v) => form.set(spec.name, v)}
        />
      ) : (
        <TextInput
          value={current[spec.name] ?? ""}
          onChange={(v) => form.set(spec.name, v)}
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
        form.save();
      }}
    >
      <p className="hint">{t.assumptions.scenariosHint}</p>
      <Panel title={t.assumptions.driversTitle}>
        <div className="form-grid">{form.drivers.map(renderField)}</div>
      </Panel>
      <Panel
        title={t.assumptions.defaultsTitle}
        info={t.assumptions.defaultsHint}
      >
        <div className="form-grid">{form.defaults.map(renderField)}</div>
      </Panel>
      {(invalid.length > 0 || formError) && (
        <div
          className="error-summary"
          role="group"
          aria-labelledby={`${formId}-summary`}
          tabIndex={-1}
          ref={summaryRef}
        >
          <p id={`${formId}-summary`} className="error-text">
            {invalid.length > 0
              ? t.common.fieldsNeedAttention(invalid.length)
              : formError}
          </p>
          {invalid.length > 0 && formError && (
            <p className="error-text">{formError}</p>
          )}
          {invalid.length > 0 && (
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
          )}
        </div>
      )}
      {/* One Save/Discard row for the whole form, kept in view (ADR 0095). */}
      <div className="form-actions sticky-actions">
        <span
          className={`form-state${form.failed ? " failed" : ""}`}
          role="status"
        >
          {form.stateText}
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={form.discard}
          disabled={!form.unsaved || form.saving}
        >
          {t.common.discardChanges}
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!form.unsaved || form.saving}
        >
          {form.saving ? t.common.saving : t.common.saveChanges}
        </Button>
      </div>
    </form>
  );
}
