// @vitest-environment jsdom
//
// The inline record form (RecordForm, and RecordFormView driven by useRecordForm): where a
// refused or failed save shows, focus after a failed save, the unsaved note, the leave
// guard, and the options a form passes to the view. The hook's own state is in
// src/ui/hooks/__tests__/useRecordForm.test.tsx.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm, RecordFormView } from "../forms";
import { LeaveGuard } from "../LeaveGuard";
import { useRecordForm } from "../../hooks/useRecordForm";
import { hasUnsavedChanges, useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { FieldSpec } from "../../model/formParse";
import type { WriteError } from "../../../state/writeError";
import { MortgageForm } from "../../pages/mortgage/MortgageForm";
import { mortgageSpecs } from "../../model/mortgageForm";
import { isoDate, money, mortgageBlock, rate } from "../../../engine";

// Module state: none. The setup file (src/__tests__/setup/stores.ts) resets both stores
// before every test, so the language and route a describe sets do not leak; every spy and
// deferred save is made inside the test that uses it.

const en = getDict("en");

const instalmentSpecs: FieldSpec[] = [
  { name: "monthlyInstalment", label: "Monthly instalment", kind: "money" },
];

/** The text a control's aria-describedby points at: its error or its hint. */
const description = (control: HTMLElement) =>
  document.getElementById(control.getAttribute("aria-describedby") ?? "")
    ?.textContent;

// UX-047: a save the store refuses keeps the form open and shows the reason — on the
// field the rule names, else above the buttons — in the user's language.
describe("where a refused save shows", () => {
  function renderForm(failure: WriteError) {
    render(
      <RecordForm
        specs={instalmentSpecs}
        initial={{ monthlyInstalment: "100" }}
        submitLabel="Save"
        onSubmit={async () => failure}
      />,
    );
  }

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
    // Field sets aria-invalid and points aria-describedby at the error exactly when it
    // shows one (fields.tsx).
    const field = screen.getByLabelText("Monthly instalment");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(description(field)).toContain(
      en.inputRules.INSTALMENT_BELOW_INTEREST,
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

// ADR 0243: a refused save names a field the form is not showing for this draft. Its
// message goes above the buttons, except a row list's first-row field (ADR 0167), which
// shows on that row.
describe("a refused save on a field the form is not showing", () => {
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

// DR-090: an onSubmit that throws (instead of resolving to a WriteError) keeps the form
// open, shows the failure above the buttons and re-enables Save.
describe("a save that throws", () => {
  it("shows the failure and re-enables the buttons", async () => {
    render(
      <RecordForm
        specs={instalmentSpecs}
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

// ADR 0246 (#538): the submit button disables while the save runs, which drops its focus
// to <body>. After a failed save the form puts focus back on it, unless the user moved it.
describe("focus after a failed save", () => {
  const failure: WriteError = { kind: "other", message: "Disk full" };

  /** A form whose save waits until `finish` settles it. */
  function renderForm() {
    let finish: (r: WriteError | undefined) => void = () => undefined;
    render(
      <>
        <RecordForm
          specs={[{ name: "amount", label: "Amount", kind: "money" }]}
          initial={{ amount: "100" }}
          submitLabel="Save"
          onSubmit={() =>
            new Promise<WriteError | undefined>((resolve) => (finish = resolve))
          }
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    return { finish: (r: WriteError | undefined) => finish(r) };
  }

  const save = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });

  it("puts focus back on Save after the fixup dropped it to <body>", async () => {
    const { finish } = renderForm();
    await userEvent.click(save());
    expect(save()).toHaveProperty("disabled", true);
    // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
    act(() => save().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => finish(failure));
    expect(screen.getByRole("alert").textContent).toContain("Disk full");
    expect(document.activeElement).toBe(save());
  });

  it("leaves focus where the user moved it during the save", async () => {
    const { finish } = renderForm();
    await userEvent.click(save());
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => finish(failure));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("keeps focus in the field a save started from by Return", async () => {
    const { finish } = renderForm();
    const field = screen.getByLabelText("Amount", { exact: false });
    await userEvent.click(field);
    await userEvent.keyboard("{Enter}");
    expect(save()).toHaveProperty("disabled", true);
    await act(async () => finish(failure));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(field);
  });
});

// ADR 0095: a record form says "Unsaved changes" next to its buttons while it holds
// unsaved edits, and nothing while it is clean.
describe("the unsaved note", () => {
  it("shows Unsaved changes in the footer only while edited", async () => {
    render(
      <RecordForm
        specs={[{ name: "monthlyRent", label: "Monthly rent", kind: "money" }]}
        initial={{ monthlyRent: "100" }}
        submitLabel="Save"
        onSubmit={async () => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.queryByText(en.common.unsavedChanges)).toBeNull();
    const field = screen.getByLabelText(/^Monthly rent/);
    await userEvent.type(field, "5");
    const note = screen.getByText(en.common.unsavedChanges);
    // In the footer: beside the form's buttons, in a row that holds both buttons and no
    // field (so the note and Save cannot leave the footer together unnoticed).
    const row = note.parentElement!;
    expect(row).toBe(
      screen.getByRole("button", { name: "Save" }).parentElement,
    );
    expect(
      row.contains(screen.getByRole("button", { name: en.common.cancel })),
    ).toBe(true);
    expect(row.contains(field)).toBe(false);
    await userEvent.clear(field);
    await userEvent.type(field, "100");
    expect(screen.queryByText(en.common.unsavedChanges)).toBeNull();
  });
});

// UX-073 (DR-151, ADR 0077): an inline record form whose draft differs from its opening
// values holds back navigation like Settings → Assumptions (UX-030). Each form registers
// on its own, so a clean form never clears another form's unsaved draft.
describe("the leave guard", () => {
  beforeEach(() =>
    act(() =>
      useUiStore.setState({
        route: "property",
      }),
    ),
  );

  function Form({
    label = "Price",
    onSubmit = () => undefined,
  }: {
    label?: string;
    onSubmit?: () => WriteError | undefined;
  }) {
    return (
      <RecordForm
        specs={[{ name: "price", label, kind: "money" }]}
        initial={{ price: "100" }}
        submitLabel={`Save ${label}`}
        onSubmit={onSubmit}
      />
    );
  }

  const unsaved = () => hasUnsavedChanges(useUiStore.getState());

  async function retype(label: string, value: string) {
    const input = screen.getByLabelText(label);
    await userEvent.clear(input);
    if (value) await userEvent.type(input, value);
  }

  it("an untouched form leaves without asking", () => {
    render(<Form />);
    expect(unsaved()).toBe(false);
    act(() => useUiStore.getState().navigate("dashboard"));
    expect(useUiStore.getState().route).toBe("dashboard");
  });

  it("an edited form asks; Keep editing keeps the draft", async () => {
    render(
      <>
        <Form />
        <LeaveGuard />
      </>,
    );
    await retype("Price", "250");
    expect(unsaved()).toBe(true);
    act(() => useUiStore.getState().navigate("dashboard"));
    expect(useUiStore.getState().route).toBe("property");
    expect(
      screen.getByRole("dialog", { name: /unsaved changes/i }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /keep editing/i }),
    );
    expect(useUiStore.getState().route).toBe("property");
    expect((screen.getByLabelText("Price") as HTMLInputElement).value).toBe(
      "250",
    );
  });

  it("typing back the opening value clears the guard", async () => {
    render(<Form />);
    await retype("Price", "250");
    await retype("Price", "100");
    expect(unsaved()).toBe(false);
  });

  it("closing the form clears the guard", async () => {
    const { unmount } = render(<Form />);
    await retype("Price", "250");
    unmount();
    expect(unsaved()).toBe(false);
  });

  it("a saved draft no longer asks, even when the store normalises it", async () => {
    render(<Form />);
    await retype("Price", "1 000");
    await userEvent.click(screen.getByRole("button", { name: "Save Price" }));
    expect(unsaved()).toBe(false);
  });

  it("a refused save keeps asking", async () => {
    render(<Form onSubmit={() => ({ kind: "other", message: "disk full" })} />);
    await retype("Price", "250");
    await userEvent.click(screen.getByRole("button", { name: "Save Price" }));
    expect(unsaved()).toBe(true);
  });

  it("a clean form does not clear another form's draft", async () => {
    const { rerender } = render(
      <>
        <Form label="A" />
        <Form label="B" />
      </>,
    );
    await retype("A", "250");
    rerender(<Form label="A" />);
    expect(unsaved()).toBe(true);
  });
});

// The record form's options: typed values to onSubmit (ADR 0074), a live hint and an
// inline field-row button, computed from the draft by the form that renders the view
// (as the mortgage form does, #490).
describe("the view's options: typed values, a live hint and a field action", () => {
  const specs = [
    { name: "principal", label: "Principal", kind: "money" },
    { name: "term", label: "Term", kind: "int", optional: true },
  ] as const;

  function HintForm({ onSubmit }: { onSubmit: () => void }) {
    const form = useRecordForm({
      specs,
      initial: { principal: "1000", term: "" },
      onSubmit,
    });
    const { draft } = form;
    return (
      <RecordFormView
        form={form}
        specs={specs}
        submitLabel="Save"
        hint={draft.principal ? `Hint for ${draft.principal}` : null}
        actions={{
          principal: draft.term
            ? { label: "Fill", patch: { principal: "9000" } }
            : { label: "Fill", title: "Enter a term first" },
          term: null,
        }}
      />
    );
  }

  function renderForm(onSubmit = vi.fn()) {
    render(<HintForm onSubmit={onSubmit} />);
    return onSubmit;
  }

  it("passes the parsed values typed by the specs", async () => {
    const onSubmit = renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [values] = onSubmit.mock.calls[0] as [Record<string, unknown>];
    expect(String(values.principal)).toBe("1000");
    expect(values.term).toBeNull();
  });

  it("shows the live hint and a field action that patches the draft", async () => {
    renderForm();
    expect(screen.getByText("Hint for 1000")).toBeTruthy();
    const fill = screen.getByRole("button", { name: "Fill" });
    expect(fill.title).toBe("Enter a term first");
    expect((fill as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Term/), "30");
    await userEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect((screen.getByLabelText(/Principal/) as HTMLInputElement).value).toBe(
      "9000",
    );
    expect(screen.getByText("Hint for 9000")).toBeTruthy();
  });
});
