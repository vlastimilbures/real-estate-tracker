// @vitest-environment jsdom
//
// UX-047: a save the store refuses keeps the form open and shows the reason — on the
// field the rule names, else above the buttons — in the user's language.
import { describe, it, expect } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../forms";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { FieldSpec } from "../../model/formParse";
import type { WriteError } from "../../../state/writeError";
import { MortgageForm } from "../../pages/mortgage/MortgageForm";
import { mortgageSpecs } from "../../model/mortgageForm";
import { isoDate, money, mortgageBlock, rate } from "../../../engine";

const specs: FieldSpec[] = [
  { name: "monthlyInstalment", label: "Monthly instalment", kind: "money" },
];

function renderForm(failure: WriteError) {
  render(
    <RecordForm
      specs={specs}
      initial={{ monthlyInstalment: "100" }}
      submitLabel="Save"
      onSubmit={async () => failure}
    />,
  );
}

describe("RecordForm shows a refused save", () => {
  it("on the field the engine rule names", async () => {
    renderForm({
      kind: "input",
      errors: [
        {
          code: "INSTALMENT_BELOW_INTEREST",
          entity: "mortgage",
          id: "m",
          field: "monthlyInstalment",
        },
      ],
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const field = screen.getByText("Monthly instalment").closest(".field")!;
    expect(field.className).toContain("invalid");
    expect(field.textContent).toContain(
      getDict("en").inputRules.INSTALMENT_BELOW_INTEREST,
    );
  });

  it("above the buttons when no shown field matches, in Czech", async () => {
    act(() => useUiStore.setState({ language: "cs" }));
    renderForm({
      kind: "constraint",
      constraint: {
        kind: "unique",
        table: "holding_costs",
        columns: ["property_id"],
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toBe(
      getDict("cs").inputRules.DUPLICATE_HOLDING_COST,
    );
  });
});

// DR-090: an onSubmit that throws (instead of resolving to a WriteError) keeps the form
// open, shows the failure above the buttons and re-enables Save.
describe("RecordForm with a throwing onSubmit (DR-090)", () => {
  it("shows the failure and re-enables the buttons", async () => {
    render(
      <RecordForm
        specs={specs}
        initial={{ monthlyInstalment: "100" }}
        submitLabel="Save"
        onSubmit={async () => {
          throw new Error("disk full");
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("disk full");
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

// ADR 0243: a refused save names a field the form is not showing for this draft. Its
// message goes above the buttons, except a row list's first-row field (ADR 0167), which
// shows on that row.
describe("a refused save on a field the form is not showing (#440, ADR 0243)", () => {
  const en = getDict("en");
  const hiddenSpecs: FieldSpec[] = [
    { name: "monthlyInstalment", label: "Monthly instalment", kind: "money" },
    {
      name: "completionDate",
      label: "Completion date",
      kind: "date",
      optional: true,
    },
  ];
  function renderHidden(failure: WriteError) {
    render(
      <RecordForm
        specs={hiddenSpecs}
        initial={{ monthlyInstalment: "100", completionDate: "" }}
        submitLabel="Save"
        hiddenFields={() => ["completionDate"]}
        onSubmit={async () => failure}
      />,
    );
  }

  it("a constraint on a hidden field shows above the buttons (#440)", async () => {
    renderHidden({
      kind: "constraint",
      constraint: {
        kind: "check",
        check: "mortgage_interest_only_until_iso",
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toContain(
      en.inputRules.INVALID_DATE,
    );
  });

  it("an input-rule error on a hidden field shows above the buttons (#440)", async () => {
    renderHidden({
      kind: "input",
      errors: [
        {
          code: "INVALID_DATE",
          entity: "mortgage",
          id: "m",
          field: "completionDate",
        },
      ],
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toContain(
      en.inputRules.INVALID_DATE,
    );
  });

  it("an error on a list's first-row field stays on that row (ADR 0167)", async () => {
    // A development loan (the mortgage form, #490): the start draw is the drawdown
    // schedule's first row, and the initial principal field is hidden.
    const block = mortgageBlock({
      id: "m",
      propertyId: "p",
      startDate: isoDate("2027-03-01"),
      initialPrincipal: money("100"),
      fixationYears: 5,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("1"),
      completionDate: isoDate("2028-03-01"),
    });
    render(
      <MortgageForm
        specs={mortgageSpecs(en)}
        row={block}
        adding={false}
        successorNote={false}
        submitLabel="Save"
        unsavedKey="m"
        onCancel={() => undefined}
        onSubmit={async () => ({
          kind: "constraint",
          constraint: {
            kind: "check",
            check: "mortgage_principal_not_negative",
          },
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByRole("group", { name: en.propertyDetail.fieldDraws })
        .textContent,
    ).toContain(en.inputRules.NEGATIVE_AMOUNT);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
