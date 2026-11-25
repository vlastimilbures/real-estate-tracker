// @vitest-environment jsdom
//
// #490 PR 3: where the property dialog shows a refused save, pinned before its keys
// become camelCase (ADR 0261, #440). A failure naming one of the form's fields shows on
// that field, a funding field's also opens the Acquisition section (ADR 0119 §9), and
// anything else shows above the buttons. A rule on the funding note shows nowhere today:
// the note's field takes no error (pinned as it is).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyFormModal } from "../PropertyFormModal";
import { usePortfolioStore } from "../../../state/portfolioStore";
import type { WriteError } from "../../../state/writeError";
import { getDict } from "../../../i18n";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import type { EngineValidationError } from "../../../engine";
import { success } from "../../../__tests__/support/result";
import { shownErrors } from "../../../__tests__/support/shownErrors";

const en = getDict("en");
const f = en.propertyForm;
const rule = en.inputRules.NEGATIVE_AMOUNT;

let refusal: WriteError;
const addProperty = vi.fn(async () => ({ ok: false as const, error: refusal }));

beforeEach(() => {
  addProperty.mockClear();
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      addProperty,
      getPropertyExtras: () =>
        Promise.resolve(success({ address: null, garage: null })),
    });
  });
});

const onField = (field?: string): WriteError => ({
  kind: "input",
  errors: [
    {
      code: "NEGATIVE_AMOUNT",
      entity: "property",
      id: "p",
      // Any name, the engine's or not, to pin where each one goes.
      ...(field !== undefined && {
        field: field as EngineValidationError["field"],
      }),
    },
  ],
});

/** Add a valid property that the store refuses with `error`: the errors shown, and
 *  whether the Acquisition section is open. */
async function refused(error: WriteError) {
  refusal = error;
  render(<PropertyFormModal mode="add" onClose={() => undefined} />);
  await userEvent.type(screen.getByLabelText(f.name), "Byt Nový");
  await userEvent.type(screen.getByLabelText(f.purchaseDate), "01.03.2021");
  await userEvent.type(screen.getByLabelText(f.purchasePrice), "5200000");
  await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
  await waitFor(() => expect(addProperty).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: f.addTitle }).hasAttribute("disabled"),
    ).toBe(false),
  );
  const open = screen
    .getByRole("button", { name: f.acquisitionSection })
    .getAttribute("aria-expanded");
  return { shown: shownErrors(), open };
}

describe("the property dialog's save errors (ADR 0261, #490)", () => {
  it.each([
    ["name", f.name],
    ["address", f.address],
    ["type", f.type],
    ["sizeM2", f.size],
    ["garage", f.garage],
    ["purchaseDate", f.purchaseDate],
    ["purchasePrice", f.purchasePrice],
    ["appreciationOverridePa", f.appreciationOverride],
    ["rentIndexOverridePa", f.rentIndexOverride],
  ])("a rule on %s shows on its field", async (field, label) => {
    expect(await refused(onField(field))).toEqual({
      shown: { [label]: rule },
      open: "false",
    });
  });

  it.each([
    ["ownCash", f.ownCash],
    ["transactionCosts", f.transactionCosts],
    ["initialWorks", f.initialWorks],
  ])(
    "a rule on %s shows on its field and opens the section",
    async (field, label) => {
      expect(await refused(onField(field))).toEqual({
        shown: { [label]: rule },
        open: "true",
      });
    },
  );

  it("a rule on the funding note shows nowhere", async () => {
    expect(await refused(onField("fundingNote"))).toEqual({
      shown: {},
      open: "false",
    });
  });

  it.each([
    ["note"],
    ["funding_note"],
    ["purchase_price"],
    ["id"],
    [undefined],
  ])("a rule on %s shows above the buttons", async (field) => {
    expect(await refused(onField(field))).toEqual({
      shown: { form: rule },
      open: "false",
    });
  });

  it("a CHECK on a funding amount shows on it and opens the section", async () => {
    expect(
      await refused({
        kind: "constraint",
        constraint: { kind: "check", check: "property_own_cash_not_negative" },
      }),
    ).toEqual({
      shown: { [f.ownCash]: en.inputRules.NEGATIVE_AMOUNT },
      open: "true",
    });
  });

  it("a duplicate name shows on the name field", async () => {
    expect(
      await refused({
        kind: "constraint",
        constraint: { kind: "unique", table: "properties", columns: ["name"] },
      }),
    ).toEqual({
      shown: { [f.name]: en.writeErrors.duplicatePropertyName },
      open: "false",
    });
  });

  it("any other failure shows above the buttons", async () => {
    expect(await refused({ kind: "other", message: "disk is full" })).toEqual({
      shown: { form: "disk is full" },
      open: "false",
    });
  });

  it("two rules on one field show the first, each field its own", async () => {
    const error: WriteError = {
      kind: "input",
      errors: [
        {
          code: "NEGATIVE_AMOUNT",
          entity: "property",
          id: "p",
          field: "purchasePrice",
        },
        {
          code: "ORPHAN_ROW",
          entity: "property",
          id: "p",
          field: "purchasePrice",
        },
        {
          code: "ORPHAN_ROW",
          entity: "property",
          id: "p",
          field: "purchaseDate",
        },
      ],
    };
    expect(await refused(error)).toEqual({
      shown: {
        [f.purchasePrice]: rule,
        [f.purchaseDate]: en.inputRules.ORPHAN_ROW,
      },
      open: "false",
    });
  });
});
