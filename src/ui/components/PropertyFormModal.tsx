import { useState, useEffect, useId, useRef, type RefObject } from "react";
import { DisclosureButton } from "./Disclosure";
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
import { Checkbox, Field, TextArea, TextInput } from "./fields";
import { DateInput } from "./DateInput";
import { Button, ErrorBanner } from "./primitives";
import { Modal } from "./Modal";
import { CZK } from "../../lib/currency";
import type { Portfolio, Property } from "../../engine";
import type { WriteError } from "../../state/writeError";
import { type Dictionary } from "../../i18n";
import { useFormSubmit, type FormFailure } from "../hooks/useFormSubmit";
import { useLeaveGuard } from "../hooks/useLeaveGuard";
import { useT } from "../hooks/useT";
import { formWriteErrors, type ErrorField } from "../model/writeError";
import { isDirty } from "../model/dirty";

const snakeToCamel = (k: string) =>
  k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Where a failed save shows: a rule tied to a field on that field, anything else above
 *  the buttons. Failures name engine fields (purchaseDate); this form's keys are
 *  snake_case. */
const BY_FIELD = new Map(
  Object.keys(BLANK_PROPERTY_FORM).map((k) => [snakeToCamel(k), k]),
);
const propertyErrorField: ErrorField = (field) => BY_FIELD.get(field) ?? null;

function propertyWriteErrors(t: Dictionary, failure: WriteError): FormFailure {
  return formWriteErrors(t, failure, propertyErrorField);
}

/** What a save writes, once the form's checks pass. */
interface SaveValues {
  property: Property;
  address: string | null;
  garage: boolean | null;
}

interface Props {
  mode: "add" | "edit";
  propertyId?: string;
  /** Open the Acquisition section from the start (a Data check link, ADR 0118). */
  openFunding?: boolean;
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
  // One decimal place (ADR 0236 §1).
  { key: "size_m2", label: (t) => t.propertyForm.size, inputMode: "decimal" },
];

const FINANCIAL_FIELD_SPECS: TextFieldSpec[] = [
  {
    key: "purchase_price",
    label: (t) => t.propertyForm.purchasePrice,
    suffix: CZK.symbol,
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
  suffix: CZK.symbol,
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

/** The stored property's fields, taken once when the edit form opens (ADR 0241 §1): a
 *  store reload while it is open, e.g. after a failed write, must not undo the input.
 *  Address and garage come from a separate read. */
function editDraft(
  portfolio: Portfolio | null,
  mode: Props["mode"],
  propertyId: string | undefined,
): PropertyFormState {
  const p =
    mode === "edit"
      ? portfolio?.properties.find((x) => x.id === propertyId)
      : undefined;
  if (!p) return BLANK_PROPERTY_FORM;
  return {
    ...BLANK_PROPERTY_FORM,
    name: p.name,
    type: p.type ?? "",
    size_m2: p.sizeM2 != null ? String(p.sizeM2) : "",
    purchase_date: dateDraft(p.purchaseDate),
    purchase_price: moneyDraft(p.purchasePrice),
    appreciation_override_pa: percentDraft(p.appreciationOverridePa),
    rent_index_override_pa: percentDraft(p.rentIndexOverridePa),
    ...fundingDraft(p.funding),
  };
}

/** The optional funding record, behind a toggle; values entered stay while it is shut. */
function AcquisitionFields({
  t,
  open,
  onToggle,
  form,
  errors,
  set,
  bodyRef,
}: {
  t: Dictionary;
  open: boolean;
  onToggle: () => void;
  bodyRef: RefObject<HTMLDivElement>;
  form: PropertyFormState;
  errors: PropertyFormErrors;
  set: (field: keyof PropertyFormState, value: string) => void;
}) {
  const bodyId = useId();
  return (
    <>
      <div className="form-wide form-disclosure">
        <DisclosureButton open={open} controls={bodyId} onToggle={onToggle}>
          {t.propertyForm.acquisitionSection}
        </DisclosureButton>
      </div>
      {/* Hidden, not removed, while shut: the toggle controls it, and it adds no grid row. */}
      <div id={bodyId} ref={bodyRef} className="form-wide" hidden={!open}>
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

export function PropertyFormModal({
  mode,
  propertyId,
  openFunding = false,
  onClose,
}: Props) {
  const t = useT();
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const getPropertyExtras = usePortfolioStore((s) => s.getPropertyExtras);
  const addProperty = usePortfolioStore((s) => s.addProperty);
  const editProperty = usePortfolioStore((s) => s.editProperty);

  // A new property's id is random and made once, so a retry cannot add a second row
  // (ADR 0127); an edit keeps the property's id.
  const [newId] = useState(() => crypto.randomUUID());
  const id = propertyId ?? newId;
  const [form, setForm] = useState<PropertyFormState>(() =>
    editDraft(portfolio, mode, propertyId),
  );
  // What the form opened with (blank, or the loaded property): input differing from it
  // is unsaved, so Esc / backdrop clicks are ignored (UX-029). Taken once, like `form`,
  // so a failed save leaves the form unsaved (ADR 0241 §2).
  const [baseline, setBaseline] = useState<PropertyFormState>(form);
  // Address and garage come from a second read in edit mode. Save waits for it and stays
  // off if it fails, so a save cannot write them NULL (ADR 0184 §3).
  const [extras, setExtras] = useState<"loading" | "ready" | "failed">(
    mode === "edit" ? "loading" : "ready",
  );
  // Shut on add; open on edit when a record exists, so what is stored is seen (ADR 0119 §9),
  // or when a Data check link asked for it.
  const [fundingOpen, setFundingOpen] = useState(
    () =>
      openFunding ||
      (mode === "edit" &&
        portfolio?.properties.find((x) => x.id === propertyId)?.funding !==
          undefined),
  );
  // Unsaved input is also known to the leave guard (ADR 0262 §2).
  useLeaveGuard(useId(), isDirty(baseline, form));
  // The message above the buttons goes with the next edit, Save or its ✕ (ADR 0262 §1).
  const {
    busy: saving,
    errors,
    formError: saveError,
    submit,
    clearFields,
    dismissFormError,
  } = useFormSubmit({
    run: async ({ property, address, garage }: SaveValues) => {
      const result =
        mode === "add"
          ? await addProperty(
              property,
              { id: `hc-${property.id}`, propertyId: property.id },
              { address, garage },
            )
          : await editProperty(property, { address, garage });
      return result.ok ? undefined : result.error;
    },
    mapErrors: (failure) => propertyWriteErrors(t, failure),
    // Keep the modal open on failure so the user can retry; close only on success.
    onSaved: onClose,
    // A funding field in error opens the Acquisition section, so the error is seen.
    onFailed: ({ fieldErrors }) => {
      if (hasFundingError(fieldErrors)) setFundingOpen(true);
    },
  });
  const canSave = !saving && extras === "ready";
  // A Data check link lands on own cash. This parent effect runs after the Modal's,
  // which focuses the first field.
  const fundingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openFunding) fundingRef.current?.querySelector("input")?.focus();
  }, [openFunding]);

  // Edit mode reads address and garage from the database. A store reload does not
  // start it again (ADR 0241 §1).
  useEffect(() => {
    if (mode !== "edit" || propertyId === undefined) return;
    const load = (patch: Partial<PropertyFormState>) => {
      setForm((f) => ({ ...f, ...patch }));
      setBaseline((f) => ({ ...f, ...patch }));
    };
    // Only the latest read counts: an older one settling late must not undo it.
    let live = true;
    void getPropertyExtras(propertyId).then((read) => {
      if (!live) return;
      if (!read.ok) return setExtras("failed");
      load({ address: read.value.address ?? "", garage: read.value.garage });
      setExtras("ready");
    });
    return () => {
      live = false;
    };
  }, [mode, propertyId, getPropertyExtras]);

  function set(field: keyof PropertyFormState, value: string | boolean | null) {
    setForm((f) => ({ ...f, [field]: value }));
    clearFields([field]);
  }

  function check() {
    const existingNames = (portfolio?.properties ?? [])
      .filter((p) => mode === "add" || p.id !== propertyId)
      .map((p) => p.name);
    const result = parsePropertyForm(form, id, existingNames, t);
    if (!result.valid) return { ok: false as const, errors: result.errors };
    const { property, address, garage } = result;
    return { ok: true as const, values: { property, address, garage } };
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
        if (extras === "ready") void submit(check);
      }}
      dirty={isDirty(baseline, form)}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSave}>
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
          bodyRef={fundingRef}
          form={form}
          errors={errors}
          set={set}
        />
      </div>
      {extras === "failed" && (
        <ErrorBanner message={t.propertyForm.errExtrasLoad} />
      )}
      {saveError && (
        <ErrorBanner message={saveError} onDismiss={dismissFormError} />
      )}
    </Modal>
  );
}
