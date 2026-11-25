// @vitest-environment jsdom
//
// UX-018: every form control has a programmatic name, and an invalid field is marked
// aria-invalid with its error (or hint) linked through aria-describedby.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Field, SelectInput, TextArea } from "../fields";
import { RecordFormView } from "../forms";
import { useRecordForm } from "../../hooks/useRecordForm";
import { EVENT_LISTS } from "../../model/loanEventRows";
import { mortgageDraft } from "../../model/mortgageForm";
import { LoanEventRows } from "../../pages/mortgage/LoanEventRows";
import { PropertyFormModal } from "../PropertyFormModal";
import { ScenarioForm } from "../../pages/ScenarioForm";
import { getDict } from "../../../i18n";
import { assumptions } from "../../../engine/__tests__/support/seed";
import type { FieldSpec } from "../../model/formParse";

/** Every input/select/textarea under `root` has an accessible name source. */
function unlabelled(root: HTMLElement): string[] {
  const controls = root.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input, select, textarea");
  return [...controls]
    .filter(
      (c) =>
        (c.labels?.length ?? 0) === 0 &&
        !c.getAttribute("aria-label") &&
        !c.getAttribute("aria-labelledby"),
    )
    .map((c) => c.outerHTML);
}

const specs: FieldSpec[] = [
  { name: "price", label: "Price", kind: "money", help: "In Kč" },
  { name: "startDate", label: "Start date", kind: "date" },
  { name: "draws", label: "Draws", kind: "draws", optional: true },
];

/** A record form with a tranche list among its fields, as the mortgage form composes
 *  it (#490: the generic RecordForm has no row lists). */
function ListForm({
  initial,
  onSubmit,
}: {
  initial: Record<string, string>;
  onSubmit: () => void;
}) {
  const form = useRecordForm({
    specs,
    initial,
    lists: { initial: mortgageDraft(null).lists, model: EVENT_LISTS },
    onSubmit,
  });
  return (
    <RecordFormView
      form={form}
      specs={specs}
      submitLabel="Save"
      slots={{
        draws: (spec) => (
          <LoanEventRows
            kind="draws"
            name={spec.name}
            label={spec.label}
            rows={form.lists.draws}
            errors={form.errors}
            onChange={(rows) => form.editList("draws", rows)}
          />
        ),
      }}
    />
  );
}

describe("Field labels its control (UX-018)", () => {
  it("names text, date, textarea and select controls", () => {
    render(
      <>
        <ListForm initial={{}} onSubmit={() => undefined} />
        <Field label="Note">
          <TextArea rows={2} value="" onChange={() => undefined} />
        </Field>
        <Field label="Kind">
          <SelectInput
            value="a"
            onChange={() => undefined}
            options={[{ value: "a", label: "A" }]}
          />
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Price").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Start date").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Note").tagName).toBe("TEXTAREA");
    // The draws are a row list (ADR 0167): a named group.
    expect(screen.getByRole("group", { name: "Draws" }).tagName).toBe(
      "FIELDSET",
    );
    expect(screen.getByLabelText("Kind").tagName).toBe("SELECT");
    expect(unlabelled(document.body)).toEqual([]);
  });

  it("links the hint, then the error, through aria-describedby", async () => {
    render(<ListForm initial={{}} onSubmit={() => undefined} />);
    const price = screen.getByLabelText("Price");
    expect(price.getAttribute("aria-invalid")).toBeNull();
    const hintId = price.getAttribute("aria-describedby")!;
    expect(document.getElementById(hintId)?.textContent).toBe("In Kč");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(price.getAttribute("aria-invalid")).toBe("true");
    const errId = price.getAttribute("aria-describedby")!;
    expect(document.getElementById(errId)?.textContent).toBe(
      getDict("en").forms.required,
    );
  });
});

describe("modal forms have no unnamed control (UX-018)", () => {
  it("Add property", () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    expect(unlabelled(document.body)).toEqual([]);
  });

  it("Add property with the Acquisition section open (ADR 0119 §9)", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: getDict("en").propertyForm.acquisitionSection,
      }),
    );
    expect(
      screen.getByRole("textbox", {
        name: getDict("en").propertyForm.fundingNote,
      }),
    ).toBeTruthy();
    expect(unlabelled(document.body)).toEqual([]);
  });

  it("New scenario", () => {
    render(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(unlabelled(document.body)).toEqual([]);
  });
});
