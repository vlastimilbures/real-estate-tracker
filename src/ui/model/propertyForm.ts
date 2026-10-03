// Pure validation + DTO assembly for the property add/edit form. Kept out of the
// modal component so it's unit-testable in the node test env (no DOM), mirroring
// ./mortgageForm.ts.
import {
  intRangeHint,
  parseDate,
  parseIntField,
  parseMoney,
  parsePercentToRatio,
} from "./formParse";
import { inRange, INT_RANGES } from "../../lib/intRanges";
import type { Property } from "../../engine";
import { slug } from "../../lib/slug";
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
};

export type PropertyFormErrors = Partial<
  Record<keyof PropertyFormState, string>
>;

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
 * inputs). `existingNames` is every other property's name (lowercased) — used for
 * the uniqueness check; the form's own current name (in edit mode) must already be
 * excluded by the caller.
 */
export function parsePropertyForm(
  form: PropertyFormState,
  mode: "add" | "edit",
  propertyId: string | undefined,
  existingNames: string[],
  t: Dictionary,
): PropertyFormResult {
  const errs: PropertyFormErrors = {};

  const name = form.name.trim();
  if (!name) {
    errs.name = t.propertyForm.errRequired;
  } else if (existingNames.includes(name.toLowerCase())) {
    errs.name = t.propertyForm.errNameExists;
  }

  const purchaseDateParsed = form.purchase_date.trim()
    ? parseDate(form.purchase_date)
    : null;
  if (!form.purchase_date.trim())
    errs.purchase_date = t.propertyForm.errRequired;
  else if (!purchaseDateParsed) errs.purchase_date = t.propertyForm.errUseDate;

  const purchasePriceParsed = form.purchase_price.trim()
    ? parseMoney(form.purchase_price)
    : null;
  if (!form.purchase_price.trim())
    errs.purchase_price = t.propertyForm.errRequired;
  else if (!purchasePriceParsed)
    errs.purchase_price = t.propertyForm.errInvalidNumber;

  const size_m2 = form.size_m2.trim() ? parseIntField(form.size_m2) : null;
  if (form.size_m2.trim() && size_m2 === null)
    errs.size_m2 = t.propertyForm.errWholeNumber;
  else if (size_m2 !== null && !inRange(size_m2, INT_RANGES.sizeM2))
    errs.size_m2 = intRangeHint(t, INT_RANGES.sizeM2); // ADR 0075 (DR-078)

  const apprOvr = form.appreciation_override_pa.trim()
    ? parsePercentToRatio(form.appreciation_override_pa)
    : null;
  if (form.appreciation_override_pa.trim() && apprOvr === null)
    errs.appreciation_override_pa = t.propertyForm.errInvalidPercentage;

  const rentOvr = form.rent_index_override_pa.trim()
    ? parsePercentToRatio(form.rent_index_override_pa)
    : null;
  if (form.rent_index_override_pa.trim() && rentOvr === null)
    errs.rent_index_override_pa = t.propertyForm.errInvalidPercentage;

  if (
    Object.keys(errs).length > 0 ||
    !purchaseDateParsed ||
    !purchasePriceParsed
  ) {
    return {
      valid: false,
      errors: errs,
      property: null,
      address: null,
      garage: null,
    };
  }

  const id = mode === "edit" && propertyId ? propertyId : slug(name);
  const property: Property = {
    id,
    name,
    type: form.type.trim() || undefined,
    sizeM2: size_m2 ?? undefined,
    purchaseDate: purchaseDateParsed,
    purchasePrice: purchasePriceParsed,
    appreciationOverridePa: apprOvr ?? undefined,
    rentIndexOverridePa: rentOvr ?? undefined,
  };
  return {
    valid: true,
    errors: {},
    property,
    address: form.address.trim() || null,
    garage: form.garage,
  };
}
