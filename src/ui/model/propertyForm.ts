// Pure validation + DTO assembly for the property add/edit form. Kept out of the
// modal component so it's unit-testable in the node test env (no DOM), mirroring
// ./mortgageForm.ts.
import {
  collectValues,
  intRangeHint,
  moneyDraft,
  parseMoney,
  type CollectRules,
  type FieldSpec,
} from "./formParse";
import { FORM_PARSERS } from "./formParsers";
import { inRange, INT_RANGES } from "../../lib/intRanges";
import type { AcquisitionFunding, Property } from "../../engine";
import type { Dictionary } from "../../i18n";

export interface PropertyFormState {
  name: string;
  address: string;
  type: string;
  size_m2: string;
  garage: boolean | null;
  purchase_date: string;
  purchase_price: string;
  appreciation_override_pa: string;
  rent_index_override_pa: string;
  /** The acquisition funding record (ADR 0119): blank = unknown. */
  own_cash: string;
  transaction_costs: string;
  initial_works: string;
  funding_note: string;
}

export const BLANK_PROPERTY_FORM: PropertyFormState = {
  name: "",
  address: "",
  type: "",
  size_m2: "",
  garage: null,
  purchase_date: "",
  purchase_price: "",
  appreciation_override_pa: "",
  rent_index_override_pa: "",
  own_cash: "",
  transaction_costs: "",
  initial_works: "",
  funding_note: "",
};

type FundingKey =
  "own_cash" | "transaction_costs" | "initial_works" | "funding_note";

/** The form's money fields for each part of the funding record. */
const FUNDING_MONEY = [
  ["own_cash", "ownCash"],
  ["transaction_costs", "transactionCosts"],
  ["initial_works", "initialWorks"],
] as const;

/** A stored funding record as the form's drafts (blank where unknown). */
export function fundingDraft(
  f: AcquisitionFunding | undefined,
): Pick<PropertyFormState, FundingKey> {
  return {
    own_cash: moneyDraft(f?.ownCash),
    transaction_costs: moneyDraft(f?.transactionCosts),
    initial_works: moneyDraft(f?.initialWorks),
    funding_note: f?.note ?? "",
  };
}

export type PropertyFormErrors = Partial<
  Record<keyof PropertyFormState, string>
>;

/** Whether any funding field has an error (the form opens its Acquisition section). */
export function hasFundingError(errors: PropertyFormErrors): boolean {
  return FUNDING_MONEY.some(([key]) => errors[key] !== undefined);
}

/** The form's parsed fields; name, address, type, garage and the note are plain text. */
function propertySpecs(t: Dictionary) {
  const p = t.propertyForm;
  return [
    { name: "purchase_date", label: p.purchaseDate, kind: "date" },
    { name: "purchase_price", label: p.purchasePrice, kind: "money" },
    { name: "size_m2", label: p.size, kind: "int", optional: true },
    {
      name: "appreciation_override_pa",
      label: p.appreciationOverride,
      kind: "pct",
      optional: true,
    },
    {
      name: "rent_index_override_pa",
      label: p.rentIndexOverride,
      kind: "pct",
      optional: true,
    },
    { name: "own_cash", label: p.ownCash, kind: "money", optional: true },
    {
      name: "transaction_costs",
      label: p.transactionCosts,
      kind: "money",
      optional: true,
    },
    {
      name: "initial_works",
      label: p.initialWorks,
      kind: "money",
      optional: true,
    },
  ] as const satisfies readonly FieldSpec[];
}

/** The property form's own messages. Money keeps its sign: a negative price or funding
 *  amount is left for the engine to refuse. */
function propertyRules(t: Dictionary): CollectRules {
  const p = t.propertyForm;
  return {
    parsers: { ...FORM_PARSERS, money: parseMoney },
    blank: () => p.errRequired,
    invalid: (spec) => {
      switch (spec.kind) {
        case "date":
          return p.errUseDate;
        case "int":
          return p.errWholeNumber;
        case "pct":
          return p.errInvalidPercentage;
        default:
          return p.errInvalidNumber;
      }
    },
  };
}

export type PropertyFormResult =
  | {
      valid: true;
      errors: Record<string, never>;
      property: Property;
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
 * Validate an in-progress property form and, when valid, assemble the engine
 * `Property` plus the address/garage extras (persisted for fidelity but not engine
 * inputs). `id` is the property's id: the edited one's, or a new random one the caller
 * made (ADR 0127). `existingNames` is every other property's name (lowercased) — used
 * for the uniqueness check; the form's own current name (in edit mode) must already be
 * excluded by the caller.
 */
export function parsePropertyForm(
  form: PropertyFormState,
  id: string,
  existingNames: string[],
  t: Dictionary,
): PropertyFormResult {
  const specs = propertySpecs(t);
  const draft = Object.fromEntries(specs.map((f) => [f.name, form[f.name]]));
  const { values: v, errors } = collectValues(specs, draft, propertyRules(t));
  const errs: PropertyFormErrors = errors;

  const name = form.name.trim();
  if (!name) {
    errs.name = t.propertyForm.errRequired;
  } else if (existingNames.includes(name.toLowerCase())) {
    errs.name = t.propertyForm.errNameExists;
  }

  if (
    !errs.size_m2 &&
    v.size_m2 !== null &&
    !inRange(v.size_m2, INT_RANGES.sizeM2)
  )
    errs.size_m2 = intRangeHint(t, INT_RANGES.sizeM2); // ADR 0075 (DR-078)

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
  for (const [key, field] of FUNDING_MONEY) {
    const amount = v[key];
    if (amount !== null) funding[field] = amount;
  }
  const note = form.funding_note.trim();
  if (note) funding.note = note;

  const property: Property = {
    id,
    name,
    type: form.type.trim() || undefined,
    sizeM2: v.size_m2 ?? undefined,
    purchaseDate: v.purchase_date,
    purchasePrice: v.purchase_price,
    appreciationOverridePa: v.appreciation_override_pa ?? undefined,
    rentIndexOverridePa: v.rent_index_override_pa ?? undefined,
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
