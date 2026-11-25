// @vitest-environment jsdom
//
// #489: the four forms share one submit state (useFormSubmit). For each form: a refused
// save shows its message, two submits dispatched in one tick write once (the busy guard
// reads a ref, not the render's busy flag), and an edit after a refused save drops the
// form-level message in every form (ADR 0262 §1; before it only Assumptions did). A dirty
// property or scenario dialog is known to the leave guard (ADR 0262 §2).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../../components/forms";
import { PropertyFormModal } from "../../components/PropertyFormModal";
import { LeaveGuard } from "../../components/LeaveGuard";
import { ScenarioForm } from "../ScenarioForm";
import { useUiStore } from "../../../state/uiStore";
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
const dialogForm = () => screen.getByRole("dialog").querySelector("form")!;

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

  it("an edit drops the form-level message (ADR 0262 §1)", async () => {
    renderForm(() => Promise.resolve(refused));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/disk full/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Price"), "5");
    expect(screen.queryByText(/disk full/)).toBeNull();
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

  it("two submits in one tick write once", async () => {
    const onSubmit = vi.fn(never);
    renderForm(onSubmit);
    await userEvent.type(name(), "Crash");
    submitTwice(dialogForm());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("an edit drops the form-level message (ADR 0262 §1)", async () => {
    renderForm(() => Promise.resolve(refused));
    await userEvent.type(name(), "Crash");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );
    expect(screen.getByText(/disk full/)).toBeTruthy();
    await userEvent.type(name(), "!");
    expect(screen.queryByText(/disk full/)).toBeNull();
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

  it("two submits in one tick write once", async () => {
    addProperty.mockImplementation(never);
    await fill();
    submitTwice(dialogForm());
    expect(addProperty).toHaveBeenCalledTimes(1);
  });

  it("an edit drops the form-level message (ADR 0262 §1)", async () => {
    await fill();
    await add();
    expect(screen.getByText(/disk full/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText(f.name), "!");
    expect(screen.queryByText(/disk full/)).toBeNull();
  });

  it("a save its checks refuse drops the form-level message (ADR 0262 §1)", async () => {
    await fill();
    await add();
    // Back to a draft that fails the form's own check, without an edit in between:
    // an untouched field cannot be emptied, so use the store's names instead.
    act(() =>
      usePortfolioStore.setState({
        portfolio: {
          ...portfolio,
          properties: [
            ...portfolio.properties,
            { ...portfolio.properties[0]!, id: "other", name: "Byt Nový" },
          ],
        },
      }),
    );
    await add();
    expect(addProperty).toHaveBeenCalledTimes(1);
    expect(screen.getByText(f.errNameExists)).toBeTruthy();
    expect(screen.queryByText(/disk full/)).toBeNull();
  });
});

describe("a dirty dialog is known to the leave guard (ADR 0262 §2)", () => {
  const sources = () => useUiStore.getState().unsavedSources;
  beforeEach(() => {
    act(() => {
      useUiStore.setState({
        route: "properties",
        unsavedSources: [],
        unsavedChanges: false,
        pendingLeave: null,
        pendingSource: null,
      });
      usePortfolioStore.setState({
        portfolio,
        assumptions,
        status: { kind: "ready" },
      });
    });
  });

  it("the property dialog registers while dirty, a navigation asks, and closing it unregisters", async () => {
    const onClose = vi.fn();
    const view = render(
      <>
        <PropertyFormModal mode="add" onClose={onClose} />
        <LeaveGuard />
      </>,
    );
    expect(sources()).toEqual([]);
    await userEvent.type(
      screen.getByLabelText(en.propertyForm.name),
      "Byt Nový",
    );
    expect(sources()).toHaveLength(1);
    act(() => useUiStore.getState().navigate("dashboard"));
    expect(screen.getByText(en.common.unsavedTitle)).toBeTruthy();
    expect(useUiStore.getState().route).toBe("properties");
    act(() => useUiStore.getState().cancelLeave());
    view.rerender(<LeaveGuard />);
    expect(sources()).toEqual([]);
  });

  it("the scenario dialog registers while dirty, and unregisters when clean", async () => {
    render(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(sources()).toEqual([]);
    const name = screen.getByLabelText(en.scenarios.name);
    await userEvent.type(name, "Crash");
    expect(sources()).toHaveLength(1);
    await userEvent.clear(name);
    expect(sources()).toEqual([]);
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

  it("two submits in one tick write once", async () => {
    save.mockImplementation(never);
    renderWithPortfolio(<SettingsPage />, { route: "settings" });
    await userEvent.clear(inflation());
    await userEvent.type(inflation(), "3");
    submitTwice(inflation().closest("form")!);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("an edit drops the form-level message (today, ADR 0095)", async () => {
    await editAndSave();
    expect(summary()).not.toBeNull();
    await userEvent.type(inflation(), "5");
    expect(summary()).toBeNull();
  });
});
