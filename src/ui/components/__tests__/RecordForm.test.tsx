// @vitest-environment jsdom
//
// UX-047: a save the store refuses keeps the form open and shows the reason — on the
// field the rule names, else above the buttons — in the user's language.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../forms";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { FieldSpec } from "../../model/formParse";
import type { WriteError } from "../../../state/writeError";

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

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

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
