// @vitest-environment jsdom
//
// #489: the four forms share one submit state (useFormSubmit). For each form: a refused
// save shows its message, two submits dispatched in one tick write once (the busy guard
// reads a ref, not the render's busy flag), and an edit after a refused save does what
// that form does today. Today only Assumptions drops the form-level message on an edit;
// ADR 0262 (Proposed, #489) would make every form drop it, and flip those tests.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../../components/forms";
import { PropertyFormModal } from "../../components/PropertyFormModal";
import { ScenarioForm } from "../ScenarioForm";
import { SettingsPage } from "../Settings";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../../state/portfolioStore";
import type { WriteError } from "../../../state/writeError";
import { describeWriteError } from "../../model/writeError";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { success } from "../../../__tests__/support/result";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

const refused: WriteError = { kind: "other", message: "disk full" };
const never = () => new Promise<never>(() => undefined);
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Two submit events in one tick, before React commits the busy flag. */
function submitTwice(form: HTMLFormElement) {
  act(() => {
    for (let i = 0; i < 2; i++)
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
  });
}

describe("RecordForm", () => {
  function renderForm(onSubmit: () => Promise<void | WriteError>) {
    render(
      <RecordForm
        specs={[{ name: "price", label: "Price", kind: "money" }]}
        initial={{ price: "100" }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );
  }

  it("a refused save shows its message", async () => {
    renderForm(() => Promise.resolve(refused));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toContain("disk full");
  });

  it("two submits in one tick write once", () => {
    const onSubmit = vi.fn(never);
    renderForm(onSubmit);
    submitTwice(document.querySelector("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("an edit keeps the form-level message (today; ADR 0262 proposed)", async () => {
    renderForm(() => Promise.resolve(refused));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.type(screen.getByLabelText("Price"), "5");
    expect(screen.getByRole("alert").textContent).toContain("disk full");
  });
});

describe("ScenarioForm", () => {
  function renderForm(onSubmit: () => Promise<void | WriteError>) {
    render(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
  }
  const name = () => screen.getByLabelText(en.scenarios.name);

  it("a refused save shows its message", async () => {
    renderForm(() => Promise.resolve(refused));
    await userEvent.type(name(), "Crash");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );
    expect(screen.getByRole("alert").textContent).toContain("disk full");
  });

  it("an edit keeps the form-level message (today; ADR 0262 proposed)", async () => {
    renderForm(() => Promise.resolve(refused));
    await userEvent.type(name(), "Crash");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );
    await userEvent.type(name(), "!");
    expect(screen.getByRole("alert").textContent).toContain("disk full");
  });
});

describe("PropertyFormModal", () => {
  const f = en.propertyForm;
  let addProperty: ReturnType<typeof vi.fn<() => Promise<MutationResult>>>;
  beforeEach(() => {
    addProperty = vi.fn(() =>
      Promise.resolve({ ok: false, error: refused } as const),
    );
    act(() =>
      usePortfolioStore.setState({
        portfolio,
        assumptions,
        status: { kind: "ready" },
        addProperty,
        getPropertyExtras: () =>
          Promise.resolve(success({ address: null, garage: null })),
      }),
    );
  });

  async function fill() {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await userEvent.type(screen.getByLabelText(f.name), "Byt Nový");
    await userEvent.type(screen.getByLabelText(f.purchaseDate), "01.03.2021");
    await userEvent.type(screen.getByLabelText(f.purchasePrice), "5200000");
  }
  const add = () =>
    userEvent.click(screen.getByRole("button", { name: f.addTitle }));

  it("a refused save shows its message", async () => {
    await fill();
    await add();
    expect(screen.getByRole("alert").textContent).toContain("disk full");
  });

  it("an edit keeps the form-level message (today; ADR 0262 proposed)", async () => {
    await fill();
    await add();
    await userEvent.type(screen.getByLabelText(f.name), "!");
    expect(screen.getByRole("alert").textContent).toContain("disk full");
  });

  it("a save its checks refuse keeps the form-level message (today; ADR 0262 proposed)", async () => {
    await fill();
    await add();
    await userEvent.clear(screen.getByLabelText(f.name));
    await add();
    expect(addProperty).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("disk full");
  });
});

describe("Assumptions form", () => {
  // An input rule on no field the form shows: listed in its error summary (ADR 0141).
  const notOnAField: WriteError = {
    kind: "input",
    errors: [
      {
        code: "SHOCK_OUT_OF_RANGE",
        entity: "assumptions",
        field: "valueShock",
      },
    ],
  };
  let save: ReturnType<typeof vi.fn<() => Promise<MutationResult>>>;
  beforeEach(() => {
    save = vi.fn(() =>
      Promise.resolve({ ok: false, error: notOnAField } as const),
    );
    act(() => usePortfolioStore.setState({ saveAssumptions: save }));
  });
  const inflation = () =>
    screen.getByLabelText(new RegExp(`^${escaped(en.assumptions.inflation)}`));
  const summary = () => document.querySelector(".error-summary");

  async function editAndSave() {
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    await userEvent.clear(inflation());
    await userEvent.type(inflation(), "3");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
  }

  it("a refused save shows its message", async () => {
    await editAndSave();
    expect(summary()?.textContent).toContain(
      describeWriteError(en, notOnAField).message,
    );
  });

  it("an edit drops the form-level message (today, ADR 0095)", async () => {
    await editAndSave();
    expect(summary()).not.toBeNull();
    await userEvent.type(inflation(), "5");
    expect(summary()).toBeNull();
  });
});
