// Pure validation + DTO assembly for the property add/edit form. Kept out of the
// modal component so it's unit-testable in the node test env (no DOM), mirroring
// ./mortgageForm.ts.
import {
  collectValues,
  formRules,
  moneyDraft,
  type FieldKind,
} from "./formParse";
import { INT_RANGES, type IntRange } from "../../lib/rules";
import { CZK } from "../../lib/currency";
import { propertyKey } from "../../lib/propertyKey";
import type { AcquisitionFunding } from "../../engine";
import type { PropertyEdit } from "../../state/portfolioStore";
import type { Dictionary } from "../../i18n";

/** Where a field sits in the dialog: the property's identity, its purchase, or the
 *  Acquisition section (ADR 0119 §9). */
type Section = "identity" | "purchase" | "funding";

/** One text or date field of the dialog: how it shows and, with a `kind`, how it parses. */
interface PropertyField {
  name: string;
  label: string;
  section: Section;
  kind?: FieldKind;
  optional?: boolean;
  range?: IntRange;
  help?: string;
  suffix?: string;
  inputMode: "text" | "numeric" | "decimal";
  placeholder?: string;
  /** Marked through Field (CSS marker + aria-required). */
  required?: boolean;
}

/**
 * The dialog's text and date fields in its order, declared once: the modal renders
 * them, the parsed ones (with a `kind`) are their own specs, and their names are the
 * form state's keys. Name, address and type are plain text; garage and the funding note
 * are not text fields.
 */
export function propertyFields(t: Dictionary) {
  const p = t.propertyForm;
  return [
    {
      name: "name",
      label: p.name,
      section: "identity",
      inputMode: "text",
      required: true,
    },
    {
      name: "address",
      label: p.address,
      section: "identity",
      inputMode: "text",
    },
    {
      name: "type",
      label: p.type,
      section: "identity",
      help: p.typeHelp,
      inputMode: "text",
    },
    {
      name: "sizeM2",
      label: p.size,
      section: "identity",
      kind: "size", // one decimal place (ADR 0236 §1)
      optional: true,
      range: INT_RANGES.sizeM2, // ADR 0075
      inputMode: "decimal",
    },
    {
      name: "purchaseDate",
      label: p.purchaseDate,
      section: "purchase",
      kind: "date",
      inputMode: "text",
      required: true,
    },
    {
      name: "purchasePrice",
      label: p.purchasePrice,
      section: "purchase",
      kind: "money",
      suffix: CZK.symbol,
      inputMode: "decimal",
      required: true,
    },
    overrideField(t, "appreciationOverridePa", p.appreciationOverride),
    overrideField(t, "rentIndexOverridePa", p.rentIndexOverride),
    fundingField(t, "ownCash", p.ownCash, p.ownCashHelp),
    fundingField(
      t,
      "transactionCosts",
      p.transactionCosts,
      p.transactionCostsHelp,
    ),
    fundingField(t, "initialWorks", p.initialWorks, p.initialWorksHelp),
  ] as const satisfies readonly PropertyField[];
}

/** A growth override (ADR 0102): a signed percentage, blank is the assumptions' level. */
function overrideField<const N extends string>(
  t: Dictionary,
  name: N,
  label: string,
) {
  return {
    name,
    label,
    section: "purchase",
    kind: "pct",
    optional: true,
    help: t.propertyForm.overrideHelp,
    suffix: "%",
    inputMode: "decimal",
    placeholder: t.forms.defaultPlaceholder,
  } as const;
}

/** The funding record's amounts (ADR 0119 §9): blank is unknown, not 0. */
function fundingField<const N extends string>(
  t: Dictionary,
  name: N,
  label: string,
  help: string,
) {
  return {
    name,
    label,
    section: "funding",
    kind: "money",
    optional: true,
    help,
    suffix: CZK.symbol,
    inputMode: "decimal",
    placeholder: t.propertyForm.unknownPlaceholder,
  } as const;
}

type Fields = ReturnType<typeof propertyFields>[number];
type TextKey = Fields["name"];

export type PropertyFormState = Record<TextKey, string> & {
  garage: boolean | null;
  /** The acquisition funding record's note (ADR 0119): blank = none. */
  fundingNote: string;
};

export const BLANK_PROPERTY_FORM: PropertyFormState = {
  name: "",
  address: "",
  type: "",
  sizeM2: "",
  garage: null,
  purchaseDate: "",
  purchasePrice: "",
  appreciationOverridePa: "",
  rentIndexOverridePa: "",
  ownCash: "",
  transactionCosts: "",
  initialWorks: "",
  fundingNote: "",
};

/** The form's keys: a failed save naming one of them shows on its field (ADR 0261). */
export const PROPERTY_FORM_KEYS: readonly string[] =
  Object.keys(BLANK_PROPERTY_FORM);

/** The funding record's amounts, keyed like the record (ADR 0119 §9). */
const FUNDING_MONEY = ["ownCash", "transactionCosts", "initialWorks"] as const;

type FundingKey = (typeof FUNDING_MONEY)[number] | "fundingNote";

/** A stored funding record as the form's drafts (blank where unknown). */
export function fundingDraft(
  f: AcquisitionFunding | undefined,
): Pick<PropertyFormState, FundingKey> {
  return {
    ownCash: moneyDraft(f?.ownCash),
    transactionCosts: moneyDraft(f?.transactionCosts),
    initialWorks: moneyDraft(f?.initialWorks),
    fundingNote: f?.note ?? "",
  };
}

export type PropertyFormErrors = Partial<
  Record<keyof PropertyFormState, string>
>;

/** Whether any funding field has an error (the form opens its Acquisition section). */
export function hasFundingError(errors: PropertyFormErrors): boolean {
  return FUNDING_MONEY.some((key) => errors[key] !== undefined);
}

/** A field that parses: its own spec. */
const parsed = <F extends Fields>(f: F): f is Extract<F, { kind: FieldKind }> =>
  "kind" in f;

export type PropertyFormResult =
  | {
      valid: true;
      errors: Record<string, never>;
      property: PropertyEdit;
      address: string | null;
      garage: boolean | null;
    }
  | {
      valid: false;
      errors: PropertyFormErrors;
      property: null;
      address: null;
      garage: null;
    };

/**
 * Validate an in-progress property form and, when valid, assemble the
 * `PropertyEdit` (the engine `Property` without its `active` flag) plus the address/garage extras (persisted for fidelity but not engine
 * inputs). `id` is the property's id: the edited one's, or a new random one the caller
 * made (ADR 0127). `existingNames` is every other property's name — used for the
 * uniqueness check, matched by `propertyKey` like CSV import (ADR 0184 §4), so a name
 * differing only in Unicode form is a duplicate (ADR 0237); the form's own current name
 * (in edit mode) must already be excluded by the caller.
 */
export function parsePropertyForm(
  form: PropertyFormState,
  id: string,
  existingNames: string[],
  t: Dictionary,
): PropertyFormResult {
  const specs = propertyFields(t).filter(parsed);
  const draft = Object.fromEntries(specs.map((f) => [f.name, form[f.name]]));
  const { values: v, errors } = collectValues(specs, draft, formRules(t));
  const errs: PropertyFormErrors = errors;

  const name = form.name.trim();
  if (!name) {
    errs.name = t.forms.required;
  } else if (existingNames.some((n) => propertyKey(n) === propertyKey(name))) {
    errs.name = t.propertyForm.errNameExists;
  }

  if (Object.keys(errs).length > 0) {
    return {
      valid: false,
      errors: errs,
      property: null,
      address: null,
      garage: null,
    };
  }

  // The record the form shows (ADR 0119 §8–§9): a blank amount is unknown and a blank note
  // is no note, so all-blank is `{}`, which clears the stored record.
  const funding: AcquisitionFunding = {};
  for (const key of FUNDING_MONEY) {
    const amount = v[key];
    if (amount !== null) funding[key] = amount;
  }
  const note = form.fundingNote.trim();
  if (note) funding.note = note;

  const property: PropertyEdit = {
    id,
    name,
    type: form.type.trim() || undefined,
    sizeM2: v.sizeM2 ?? undefined,
    purchaseDate: v.purchaseDate,
    purchasePrice: v.purchasePrice,
    appreciationOverridePa: v.appreciationOverridePa ?? undefined,
    rentIndexOverridePa: v.rentIndexOverridePa ?? undefined,
    funding,
  };
  return {
    valid: true,
    errors: {},
    property,
    address: form.address.trim() || null,
    garage: form.garage,
  };
}
