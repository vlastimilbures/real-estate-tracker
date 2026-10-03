import { useState, useEffect } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { dateDraft, moneyDraft, percentDraft } from "../model/formParse";
import {
  parsePropertyForm,
  BLANK_PROPERTY_FORM,
  type PropertyFormState,
  type PropertyFormErrors,
} from "../model/propertyForm";
import { Checkbox, Field, TextInput } from "./forms";
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

  async function handleSave() {
    const existingNames = (portfolio?.properties ?? [])
      .filter((p) => mode === "add" || p.id !== propertyId)
      .map((p) => p.name.toLowerCase());
    const result = parsePropertyForm(form, mode, propertyId, existingNames, t);
    setErrors(result.errors);
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
    setErrors(fieldErrors);
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
      </div>
      {saveError && (
        <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} />
      )}
    </Modal>
  );
}
