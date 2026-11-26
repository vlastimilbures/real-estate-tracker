import { useEffect, useId, useRef } from "react";
import { Panel, Button, EmptyState } from "../components/primitives";
import { FolderOpen } from "lucide-react";
import { Field, TextInput } from "../components/fields";
import { DateInput } from "../components/DateInput";
import type { FieldSpec } from "../model/formParse";
import { useT } from "../hooks/useT";
import type { AssumptionsForm } from "../hooks/useAssumptionsForm";
import { KEEP, useFocusAfterBusy } from "../hooks/useBusyFocus";

/** The Assumptions fields and error summary, on the Settings page's Assumptions tab. Its
 *  Save and Discard sit in the top bar (`AssumptionsActions`, ADR 0221). */
export function AssumptionsPanel({
  form,
  formId,
}: {
  form: AssumptionsForm;
  /** The `<form>` id, which the top bar's Save submits through `form=`. */
  formId: string;
}) {
  const t = useT();
  const summaryRef = useRef<HTMLDivElement>(null);
  const fieldsId = useId();
  const fieldId = (name: string) => `${fieldsId}-${name}`;
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
      id={formId}
      className="form-contents assumptions-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.save();
      }}
      onKeyDown={(e) => {
        // Return in a field saves, as with a Save inside the form (UX-028). The Save
        // button sits in the top bar (ADR 0221), so this does not rely on implicit
        // submission reaching a button outside the form. Disabled while nothing changed.
        const el = e.target as HTMLElement;
        // keyCode 229: WebKit's Enter that commits an IME composition (isComposing is
        // already false by then).
        if (
          e.key !== "Enter" ||
          e.defaultPrevented ||
          e.nativeEvent.isComposing ||
          e.nativeEvent.keyCode === 229 ||
          el.tagName !== "INPUT"
        )
          return;
        e.preventDefault();
        if (form.unsaved && !form.saving) form.save();
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
          aria-labelledby={`${fieldsId}-summary`}
          tabIndex={-1}
          ref={summaryRef}
        >
          <p id={`${fieldsId}-summary`} className="error-text">
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
                    className="link-button underlined"
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
    </form>
  );
}

/** The Assumptions state text, Discard and Save, in the Settings top bar (ADR 0095 §2–§3,
 *  ADR 0221 §2). Save submits the form from outside it. */
export function AssumptionsActions({
  form,
  formId,
}: {
  form: AssumptionsForm;
  formId: string;
}) {
  const t = useT();
  // A failed save shown only in the banner puts focus back on Save; one that lists
  // errors focuses the summary (ADR 0248 §4, ADR 0095 §4).
  const remember = useFocusAfterBusy(form.saving, (el) =>
    form.failed && form.invalid.length === 0 && !form.formError ? el : KEEP,
  );
  if (!form.current) return null;
  return (
    <div className="form-actions topbar-form-actions">
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
        form={formId}
        variant="primary"
        onClick={remember}
        disabled={!form.unsaved || form.saving}
      >
        {form.saving ? t.common.saving : t.common.saveChanges}
      </Button>
    </div>
  );
}
