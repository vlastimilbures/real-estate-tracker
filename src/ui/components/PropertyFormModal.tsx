import { useState, useEffect, useRef, type RefObject } from "react";
import { DisclosureButton } from "./Disclosure";
import { useDisclosure } from "../hooks/useDisclosure";
import {
  usePortfolioStore,
  type PropertyEdit,
} from "../../state/portfolioStore";
import { dateDraft, moneyDraft, percentDraft } from "../model/formParse";
import {
  parsePropertyForm,
  propertyFields,
  fundingDraft,
  hasFundingError,
  BLANK_PROPERTY_FORM,
  PROPERTY_FORM_KEYS,
  type PropertyFormState,
} from "../model/propertyForm";
import { Checkbox, Field, TextArea, TextInput } from "./fields";
import { DateInput } from "./DateInput";
import { Button, ErrorBanner } from "./primitives";
import { Modal } from "./Modal";
import type { Portfolio } from "../../engine";
import { type Dictionary } from "../../i18n";
import { useDraftForm } from "../hooks/useDraftForm";
import { useT } from "../hooks/useT";
import { formWriteErrors, type ErrorField } from "../model/writeError";

/** Where a failed save shows: a rule tied to one of the form's fields (named like the
 *  engine field) on that field, anything else above the buttons (ADR 0261). */
const propertyErrorField: ErrorField = (field) =>
  PROPERTY_FORM_KEYS.includes(field) ? field : null;

/** What a save writes, once the form's checks pass. */
interface SaveValues {
  property: PropertyEdit;
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

type FieldSpec = ReturnType<typeof propertyFields>[number];
type Errors = Readonly<Record<string, string>>;
type SetField = (
  field: keyof PropertyFormState,
  value: string | boolean | null,
) => void;

/** One of the dialog's text fields, or its date field. */
function PropertyTextField({
  spec,
  value,
  error,
  onChange,
}: {
  spec: FieldSpec;
  value: string;
  error: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Field
      label={spec.label}
      required={"required" in spec ? spec.required : undefined}
      error={error}
      help={"help" in spec ? spec.help : undefined}
    >
      {"kind" in spec && spec.kind === "date" ? (
        <DateInput value={value} onChange={onChange} />
      ) : (
        <TextInput
          value={value}
          onChange={onChange}
          suffix={"suffix" in spec ? spec.suffix : undefined}
          inputMode={spec.inputMode}
          placeholder={"placeholder" in spec ? spec.placeholder : undefined}
        />
      )}
    </Field>
  );
}

/** The fields of one part of the dialog, in their order. */
function FieldsOf({
  specs,
  form,
  errors,
  set,
}: {
  specs: readonly FieldSpec[];
  form: PropertyFormState;
  errors: Errors;
  set: SetField;
}) {
  return (
    <>
      {specs.map((spec) => (
        <PropertyTextField
          key={spec.name}
          spec={spec}
          value={form[spec.name]}
          error={errors[spec.name]}
          onChange={(v) => set(spec.name, v)}
        />
      ))}
    </>
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
    sizeM2: p.sizeM2 != null ? String(p.sizeM2) : "",
    purchaseDate: dateDraft(p.purchaseDate),
    purchasePrice: moneyDraft(p.purchasePrice),
    appreciationOverridePa: percentDraft(p.appreciationOverridePa),
    rentIndexOverridePa: percentDraft(p.rentIndexOverridePa),
    ...fundingDraft(p.funding),
  };
}

/** The optional funding record, behind a toggle; values entered stay while it is shut. */
function AcquisitionFields({
  t,
  specs,
  open,
  onOpenChange,
  form,
  errors,
  set,
  bodyRef,
}: {
  t: Dictionary;
  specs: readonly FieldSpec[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bodyRef: RefObject<HTMLDivElement>;
  form: PropertyFormState;
  errors: Errors;
  set: SetField;
}) {
  const disclosure = useDisclosure({ open, onOpenChange });
  return (
    <>
      <div className="form-wide form-disclosure">
        <DisclosureButton
          open={open}
          controls={disclosure.id}
          onToggle={disclosure.toggle}
        >
          {t.propertyForm.acquisitionSection}
        </DisclosureButton>
      </div>
      {/* Hidden, not removed, while shut: the toggle controls it, and it adds no grid row. */}
      <div
        id={disclosure.id}
        ref={bodyRef}
        className="form-wide"
        hidden={!open}
      >
        {open && (
          <div className="form-grid">
            <p className="form-wide panel-note">
              {t.propertyForm.acquisitionHelp}
            </p>
            <FieldsOf specs={specs} form={form} errors={errors} set={set} />
            <div className="form-wide">
              <Field label={t.propertyForm.fundingNote}>
                <TextArea
                  rows={2}
                  value={form.fundingNote}
                  onChange={(e) => set("fundingNote", e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** The dialog's fields in their order: identity, garage, purchase, then Acquisition. */
function PropertyFields({
  t,
  form,
  errors,
  set,
  fundingOpen,
  setFundingOpen,
  fundingRef,
}: {
  t: Dictionary;
  form: PropertyFormState;
  errors: Errors;
  set: SetField;
  fundingOpen: boolean;
  setFundingOpen: (open: boolean) => void;
  fundingRef: RefObject<HTMLDivElement>;
}) {
  const specs = propertyFields(t);
  const part = (section: FieldSpec["section"]) =>
    specs.filter((s) => s.section === section);
  const fields = { form, errors, set };
  return (
    <div className="form-grid">
      <FieldsOf specs={part("identity")} {...fields} />
      <Field label={t.propertyForm.garage} error={errors.garage}>
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
      <FieldsOf specs={part("purchase")} {...fields} />
      <AcquisitionFields
        t={t}
        specs={part("funding")}
        open={fundingOpen}
        onOpenChange={setFundingOpen}
        bodyRef={fundingRef}
        {...fields}
      />
    </div>
  );
}

/** Address and garage, read from the database in edit mode. Save waits for the read and
 *  stays off if it fails, so a save cannot write them NULL (ADR 0184 §3); a store reload
 *  does not start it again (ADR 0241 §1). */
function usePropertyExtras(
  mode: Props["mode"],
  propertyId: string | undefined,
  load: (next: (f: PropertyFormState) => PropertyFormState) => void,
) {
  const getPropertyExtras = usePortfolioStore((s) => s.getPropertyExtras);
  const [extras, setExtras] = useState<"loading" | "ready" | "failed">(
    mode === "edit" ? "loading" : "ready",
  );
  useEffect(() => {
    if (mode !== "edit" || propertyId === undefined) return;
    // Only the latest read counts: an older one settling late must not undo it.
    let live = true;
    void getPropertyExtras(propertyId).then((read) => {
      if (!live) return;
      if (!read.ok) return setExtras("failed");
      const { address, garage } = read.value;
      load((f) => ({ ...f, address: address ?? "", garage }));
      setExtras("ready");
    });
    return () => {
      live = false;
    };
  }, [mode, propertyId, getPropertyExtras, load]);
  return extras;
}

export function PropertyFormModal({
  mode,
  propertyId,
  openFunding = false,
  onClose,
}: Props) {
  const t = useT();
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const addProperty = usePortfolioStore((s) => s.addProperty);
  const editProperty = usePortfolioStore((s) => s.editProperty);

  // A new property's id is random and made once, so a retry cannot add a second row
  // (ADR 0127); an edit keeps the property's id.
  const [newId] = useState(() => crypto.randomUUID());
  const id = propertyId ?? newId;
  // Shut on add; open on edit when a record exists, so what is stored is seen (ADR 0119 §9),
  // or when a Data check link asked for it.
  const [fundingOpen, setFundingOpen] = useState(
    () =>
      openFunding ||
      (mode === "edit" &&
        portfolio?.properties.find((x) => x.id === propertyId)?.funding !==
          undefined),
  );
  // What the form opened with (blank, or the loaded property) is its baseline: input
  // differing from it is unsaved, so Esc / backdrop clicks are ignored and the
  // leave guard asks (ADR 0262 §2). Taken once, so a failed save leaves the form unsaved
  // (ADR 0241 §2). The message above the buttons goes with the next edit, Save or its ✕
  // (ADR 0262 §1).
  const form = useDraftForm({
    initial: () => editDraft(portfolio, mode, propertyId),
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
    mapErrors: (failure) => formWriteErrors(t, failure, propertyErrorField),
    // Keep the modal open on failure so the user can retry; close only on success.
    onSaved: onClose,
    // A funding field in error opens the Acquisition section, so the error is seen.
    onFailed: ({ fieldErrors }) => {
      if (hasFundingError(fieldErrors)) setFundingOpen(true);
    },
  });
  // A Data check link lands on own cash. This parent effect runs after the Modal's,
  // which focuses the first field.
  const fundingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openFunding) fundingRef.current?.querySelector("input")?.focus();
  }, [openFunding]);
  const extras = usePropertyExtras(mode, propertyId, form.load);
  const canSave = !form.busy && extras === "ready";

  const set: SetField = (field, value) =>
    form.edit((f) => ({ ...f, [field]: value }), [field]);

  function check() {
    const existingNames = (portfolio?.properties ?? [])
      .filter((p) => mode === "add" || p.id !== propertyId)
      .map((p) => p.name);
    const result = parsePropertyForm(form.draft, id, existingNames, t);
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
        if (extras === "ready") void form.submit(check);
      }}
      dirty={form.unsaved}
      busy={form.busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={form.busy}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSave}>
            {form.busy
              ? t.common.saving
              : mode === "add"
                ? t.propertyForm.addTitle
                : t.common.saveChanges}
          </Button>
        </>
      }
    >
      <PropertyFields
        t={t}
        form={form.draft}
        errors={form.errors}
        set={set}
        fundingOpen={fundingOpen}
        setFundingOpen={setFundingOpen}
        fundingRef={fundingRef}
      />
      {extras === "failed" && (
        <ErrorBanner message={t.propertyForm.errExtrasLoad} />
      )}
      {form.formError && (
        <ErrorBanner
          message={form.formError}
          onDismiss={form.dismissFormError}
        />
      )}
    </Modal>
  );
}
