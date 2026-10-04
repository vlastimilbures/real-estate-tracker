import { useState, useEffect, useId } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { dateDraft, moneyDraft, percentDraft } from "../model/formParse";
import {
  parsePropertyForm,
  fundingDraft,
  hasFundingError,
  BLANK_PROPERTY_FORM,
  type PropertyFormState,
  type PropertyFormErrors,
} from "../model/propertyForm";
import { Checkbox, Field, TextArea, TextInput } from "./forms";
import { DateInput } from "./DateInput";
import { Button, ErrorBanner } from "./primitives";
import { Modal } from "./Modal";
import { currencySymbol } from "../../lib/currency";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { formWriteErrors } from "../model/writeError";
import { isDirty } from "../model/dirty";

const snakeToCamel = (k: string) =>
  k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

interface Props {
  mode: "add" | "edit";
  propertyId?: string;
  onClose: () => void;
}

type TextFieldKey = Extract<
  keyof PropertyFormState,
  | "name"
  | "address"
  | "type"
  | "size_m2"
  | "purchase_price"
  | "appreciation_override_pa"
  | "rent_index_override_pa"
  | "own_cash"
  | "transaction_costs"
  | "initial_works"
>;

interface TextFieldSpec {
  key: TextFieldKey;
  label: (t: Dictionary) => string;
  help?: (t: Dictionary) => string;
  suffix?: string;
  inputMode: "text" | "numeric" | "decimal";
  placeholder?: (t: Dictionary) => string;
  /** Marked through Field (CSS marker + aria-required, UX-072). */
  required?: boolean;
}

const IDENTITY_FIELD_SPECS: TextFieldSpec[] = [
  {
    key: "name",
    label: (t) => t.propertyForm.name,
    inputMode: "text",
    required: true,
  },
  { key: "address", label: (t) => t.propertyForm.address, inputMode: "text" },
  {
    key: "type",
    label: (t) => t.propertyForm.type,
    help: (t) => t.propertyForm.typeHelp,
    inputMode: "text",
  },
  { key: "size_m2", label: (t) => t.propertyForm.size, inputMode: "numeric" },
];

const FINANCIAL_FIELD_SPECS: TextFieldSpec[] = [
  {
    key: "purchase_price",
    label: (t) => t.propertyForm.purchasePrice,
    suffix: currencySymbol(),
    inputMode: "decimal",
    required: true,
  },
  {
    key: "appreciation_override_pa",
    label: (t) => t.propertyForm.appreciationOverride,
    help: (t) => t.propertyForm.overrideHelp,
    suffix: "%",
    inputMode: "decimal",
    placeholder: (t) => t.forms.defaultPlaceholder,
  },
  {
    key: "rent_index_override_pa",
    label: (t) => t.propertyForm.rentIndexOverride,
    help: (t) => t.propertyForm.overrideHelp,
    suffix: "%",
    inputMode: "decimal",
    placeholder: (t) => t.forms.defaultPlaceholder,
  },
];

/** The funding record's amounts (ADR 0119 §9): blank is unknown, not 0. */
const fundingSpec = (
  key: TextFieldKey,
  label: (t: Dictionary) => string,
  help: (t: Dictionary) => string,
): TextFieldSpec => ({
  key,
  label,
  help,
  suffix: currencySymbol(),
  inputMode: "decimal",
  placeholder: (t) => t.propertyForm.unknownPlaceholder,
});

const FUNDING_FIELD_SPECS: TextFieldSpec[] = [
  fundingSpec(
    "own_cash",
    (t) => t.propertyForm.ownCash,
    (t) => t.propertyForm.ownCashHelp,
  ),
  fundingSpec(
    "transaction_costs",
    (t) => t.propertyForm.transactionCosts,
    (t) => t.propertyForm.transactionCostsHelp,
  ),
  fundingSpec(
    "initial_works",
    (t) => t.propertyForm.initialWorks,
    (t) => t.propertyForm.initialWorksHelp,
  ),
];

function PropertyTextField({
  spec,
  t,
  value,
  error,
  onChange,
}: {
  spec: TextFieldSpec;
  t: Dictionary;
  value: string;
  error: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Field
      label={spec.label(t)}
      required={spec.required}
      error={error}
      help={spec.help?.(t)}
    >
      <TextInput
        value={value}
        onChange={onChange}
        suffix={spec.suffix}
        inputMode={spec.inputMode}
        placeholder={spec.placeholder?.(t)}
      />
    </Field>
  );
}

/** The optional funding record, behind a toggle; values entered stay while it is shut. */
function AcquisitionFields({
  t,
  open,
  onToggle,
  form,
  errors,
  set,
}: {
  t: Dictionary;
  open: boolean;
  onToggle: () => void;
  form: PropertyFormState;
  errors: PropertyFormErrors;
  set: (field: keyof PropertyFormState, value: string) => void;
}) {
  const bodyId = useId();
  return (
    <>
      <div className="form-wide form-disclosure">
        <Button
          size="sm"
          variant="ghost"
          icon={open ? ChevronUp : ChevronDown}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          {t.propertyForm.acquisitionSection}
        </Button>
      </div>
      {/* Hidden, not removed, while shut: the toggle controls it, and it adds no grid row. */}
      <div id={bodyId} className="form-wide" hidden={!open}>
        {open && (
          <div className="form-grid">
            <p className="form-wide panel-note">
              {t.propertyForm.acquisitionHelp}
            </p>
            {FUNDING_FIELD_SPECS.map((spec) => (
              <PropertyTextField
                key={spec.key}
                spec={spec}
                t={t}
                value={form[spec.key]}
                error={errors[spec.key]}
                onChange={(v) => set(spec.key, v)}
              />
            ))}
            <div className="form-wide">
              <Field label={t.propertyForm.fundingNote}>
                <TextArea
                  rows={2}
                  value={form.funding_note}
                  onChange={(e) => set("funding_note", e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function PropertyFormModal({ mode, propertyId, onClose }: Props) {
  const t = useT();
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const getPropertyExtras = usePortfolioStore((s) => s.getPropertyExtras);
  const addProperty = usePortfolioStore((s) => s.addProperty);
  const editProperty = usePortfolioStore((s) => s.editProperty);

  const [form, setForm] = useState<PropertyFormState>(BLANK_PROPERTY_FORM);
  // What the form opened with (blank, or the loaded property): input differing from it
  // is unsaved, so Esc / backdrop clicks are ignored (UX-029).
  const [baseline, setBaseline] =
    useState<PropertyFormState>(BLANK_PROPERTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof PropertyFormState, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Shut on add; open on edit when a record exists, so what is stored is seen (ADR 0119 §9).
  const [fundingOpen, setFundingOpen] = useState(
    () =>
      mode === "edit" &&
      portfolio?.properties.find((x) => x.id === propertyId)?.funding !==
        undefined,
  );

  // For edit mode: load engine fields from portfolio + address/garage from DB
  useEffect(() => {
    if (mode !== "edit" || !propertyId) return;
    const p = portfolio?.properties.find((x) => x.id === propertyId);
    const load = (patch: Partial<PropertyFormState>) => {
      setForm((f) => ({ ...f, ...patch }));
      setBaseline((f) => ({ ...f, ...patch }));
    };
    if (p) {
      load({
        name: p.name,
        type: p.type ?? "",
        size_m2: p.sizeM2 != null ? String(p.sizeM2) : "",
        purchase_date: dateDraft(p.purchaseDate),
        purchase_price: moneyDraft(p.purchasePrice),
        appreciation_override_pa: percentDraft(p.appreciationOverridePa),
        rent_index_override_pa: percentDraft(p.rentIndexOverridePa),
        ...fundingDraft(p.funding),
      });
    }
    void getPropertyExtras(propertyId).then(({ address, garage }) => {
      load({ address: address ?? "", garage });
    });
  }, [mode, propertyId, portfolio, getPropertyExtras]);

  function set(field: keyof PropertyFormState, value: string | boolean | null) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[field];
      return copy;
    });
  }

  // A funding field in error opens the Acquisition section, so the error is seen.
  function showErrors(next: PropertyFormErrors) {
    setErrors(next);
    if (hasFundingError(next)) setFundingOpen(true);
  }

  async function handleSave() {
    const existingNames = (portfolio?.properties ?? [])
      .filter((p) => mode === "add" || p.id !== propertyId)
      .map((p) => p.name.toLowerCase());
    const result = parsePropertyForm(form, mode, propertyId, existingNames, t);
    showErrors(result.errors);
    if (!result.valid) return;
    const { property, address, garage } = result;
    setSaving(true);
    setSaveError(null);
    const saveResult =
      mode === "add"
        ? await addProperty(
            property,
            { id: `hc-${property.id}`, propertyId: property.id },
            { address, garage },
          )
        : await editProperty(property, { address, garage });
    setSaving(false);
    // Keep the modal open on failure so the user can retry; close only on success.
    if (saveResult.ok) return onClose();
    // A rule tied to a field shows on that field; anything else above the buttons.
    // Failures name engine fields (purchaseDate); this form's keys are snake_case.
    const keys = Object.keys(form) as (keyof PropertyFormState)[];
    const byField = new Map(keys.map((k) => [snakeToCamel(k), k]));
    const split = formWriteErrors(t, saveResult.error, [...byField.keys()]);
    const fieldErrors: PropertyFormErrors = {};
    for (const [field, message] of Object.entries(split.fieldErrors)) {
      const key = byField.get(field); // split only names the fields passed in
      if (key) fieldErrors[key] = message;
    }
    showErrors(fieldErrors);
    setSaveError(split.formError);
  }

  return (
    <Modal
      titleId="property-form-modal-title"
      title={
        mode === "add" ? t.propertyForm.addTitle : t.propertyForm.editTitle
      }
      onClose={onClose}
      closeLabel={t.common.close}
      onSubmit={() => {
        if (!saving) void handleSave();
      }}
      dirty={isDirty(baseline, form)}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving
              ? t.common.saving
              : mode === "add"
                ? t.propertyForm.addTitle
                : t.common.saveChanges}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {IDENTITY_FIELD_SPECS.map((spec) => (
          <PropertyTextField
            key={spec.key}
            spec={spec}
            t={t}
            value={form[spec.key]}
            error={errors[spec.key]}
            onChange={(v) => set(spec.key, v)}
          />
        ))}
        <Field
          label={t.propertyForm.garage}
          error={errors.garage as string | undefined}
        >
          <div className="checkbox-row">
            <label className="checkbox-label">
              <Checkbox
                checked={form.garage === true}
                onChange={(e) => set("garage", e.target.checked ? true : null)}
              />
              {t.propertyForm.garageYes}
            </label>
          </div>
        </Field>
        <Field
          label={t.propertyForm.purchaseDate}
          required
          error={errors.purchase_date}
        >
          <DateInput
            value={form.purchase_date}
            onChange={(v) => set("purchase_date", v)}
          />
        </Field>
        {FINANCIAL_FIELD_SPECS.map((spec) => (
          <PropertyTextField
            key={spec.key}
            spec={spec}
            t={t}
            value={form[spec.key]}
            error={errors[spec.key]}
            onChange={(v) => set(spec.key, v)}
          />
        ))}
        <AcquisitionFields
          t={t}
          open={fundingOpen}
          onToggle={() => setFundingOpen((o) => !o)}
          form={form}
          errors={errors}
          set={set}
        />
      </div>
      {saveError && (
        <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} />
      )}
    </Modal>
  );
}
