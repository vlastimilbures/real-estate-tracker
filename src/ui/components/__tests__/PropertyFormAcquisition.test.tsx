// @vitest-environment jsdom
//
// ADR 0119 §8–§9 (#33 PR3): the property form's optional Acquisition section. It is the
// only place that clears a funding amount or sets the note, so a save always sends the
// record the form shows; an empty one clears the stored record.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyFormModal } from "../PropertyFormModal";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { money, type Portfolio, type Property } from "../../../engine";
import type { MutationResult } from "../../../state/portfolioStore";

const en = getDict("en");
const f = en.propertyForm;

const ok = (): Promise<MutationResult> => Promise.resolve({ ok: true });
let addProperty: ReturnType<
  typeof vi.fn<(p: Property) => Promise<MutationResult>>
>;
let editProperty: ReturnType<
  typeof vi.fn<(p: Property) => Promise<MutationResult>>
>;

function withFunding(id: string, funding: Property["funding"]): Portfolio {
  return {
    ...portfolio,
    properties: portfolio.properties.map((p) =>
      p.id === id ? { ...p, funding } : p,
    ),
  };
}

beforeEach(() => {
  addProperty = vi.fn(ok);
  editProperty = vi.fn(ok);
  act(() => {
    useUiStore.setState({ language: "en" });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      addProperty,
      editProperty,
      getPropertyExtras: () => Promise.resolve({ address: null, garage: null }),
    });
  });
});

const toggle = () => screen.getByRole("button", { name: f.acquisitionSection });

async function fillRequired() {
  await userEvent.type(screen.getByLabelText(f.name), "Byt Nový");
  await userEvent.type(screen.getByLabelText(f.purchaseDate), "01.03.2021");
  await userEvent.type(screen.getByLabelText(f.purchasePrice), "5200000");
}

/** The funding record of the n-th call's Property, amounts as strings. */
function savedFunding(fn: typeof addProperty) {
  const funding = fn.mock.calls[0]![0].funding;
  return (
    funding &&
    Object.fromEntries(Object.entries(funding).map(([k, v]) => [k, String(v)]))
  );
}

describe("property form Acquisition section (ADR 0119 §9)", () => {
  it("add: starts shut; its toggle controls a body that is on the page", () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    const body = document.getElementById(
      toggle().getAttribute("aria-controls")!,
    );
    expect(body).not.toBeNull();
    expect(screen.queryByLabelText(f.ownCash)).toBeNull();
  });

  it("opens to own cash, transaction costs, initial works and a note, none required", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await userEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    for (const label of [
      f.ownCash,
      f.transactionCosts,
      f.initialWorks,
      f.fundingNote,
    ]) {
      const control = screen.getByLabelText(label);
      expect(control.getAttribute("aria-required"), label).toBeNull();
    }
    expect(screen.getByLabelText(f.ownCash).getAttribute("placeholder")).toBe(
      f.unknownPlaceholder,
    );
  });

  it("add: saves the entered record with the property", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired();
    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(f.ownCash), "1 500 000");
    await userEvent.type(screen.getByLabelText(f.fundingNote), " Deposit ");
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    await waitFor(() => expect(addProperty).toHaveBeenCalledOnce());
    expect(savedFunding(addProperty)).toEqual({
      ownCash: "1500000",
      note: "Deposit",
    });
  });

  it("add: a section left blank saves an empty record", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    await waitFor(() => expect(addProperty).toHaveBeenCalledOnce());
    expect(addProperty.mock.calls[0]![0].funding).toStrictEqual({});
  });

  it("edit: opens with the stored record drafted", async () => {
    act(() =>
      usePortfolioStore.setState({
        portfolio: withFunding("lipova", {
          ownCash: money("1500000"),
          note: "Deposit",
        }),
      }),
    );
    render(
      <PropertyFormModal
        mode="edit"
        propertyId="lipova"
        onClose={() => undefined}
      />,
    );
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText<HTMLInputElement>(f.ownCash).value).toBe(
      "1500000",
    );
    expect(
      screen.getByLabelText<HTMLInputElement>(f.transactionCosts).value,
    ).toBe("");
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(f.fundingNote).value,
    ).toBe("Deposit");
  });

  it("edit: stays shut when nothing is recorded", () => {
    render(
      <PropertyFormModal
        mode="edit"
        propertyId="dubova"
        onClose={() => undefined}
      />,
    );
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("edit: clearing every field saves an empty record, which clears the stored one", async () => {
    act(() =>
      usePortfolioStore.setState({
        portfolio: withFunding("lipova", {
          ownCash: money("1500000"),
          note: "Deposit",
        }),
      }),
    );
    render(
      <PropertyFormModal
        mode="edit"
        propertyId="lipova"
        onClose={() => undefined}
      />,
    );
    await userEvent.clear(screen.getByLabelText(f.ownCash));
    await userEvent.clear(screen.getByLabelText(f.fundingNote));
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    await waitFor(() => expect(editProperty).toHaveBeenCalledOnce());
    expect(editProperty.mock.calls[0]![0].funding).toStrictEqual({});
  });

  it("shutting the section keeps the entered values, and they are saved", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired();
    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(f.initialWorks), "0");
    await userEvent.click(toggle());
    expect(screen.queryByLabelText(f.initialWorks)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    await waitFor(() => expect(addProperty).toHaveBeenCalledOnce());
    expect(savedFunding(addProperty)).toEqual({ initialWorks: "0" });
  });

  it("an invalid amount in the shut section opens it and marks the field", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired();
    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(f.transactionCosts), "abc");
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const field = screen.getByLabelText(f.transactionCosts).closest(".field");
    expect(field?.className).toContain("invalid");
    expect(field?.textContent).toContain(f.errInvalidNumber);
    expect(addProperty).not.toHaveBeenCalled();
  });

  it("a negative amount the engine refuses shows on its field and opens the section", async () => {
    editProperty.mockResolvedValue({
      ok: false,
      error: {
        kind: "input",
        errors: [
          {
            code: "NEGATIVE_AMOUNT",
            entity: "property",
            id: "dubova",
            field: "ownCash",
          },
        ],
      },
    });
    render(
      <PropertyFormModal
        mode="edit"
        propertyId="dubova"
        onClose={() => undefined}
      />,
    );
    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(f.ownCash), "-5");
    await userEvent.click(toggle());
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    await waitFor(() =>
      expect(toggle().getAttribute("aria-expanded")).toBe("true"),
    );
    const field = screen.getByLabelText(f.ownCash).closest(".field");
    expect(field?.textContent).toContain(en.inputRules.NEGATIVE_AMOUNT);
  });

  it("opening or shutting the section is not an unsaved change: Esc still closes", async () => {
    const onClose = vi.fn();
    render(<PropertyFormModal mode="add" onClose={onClose} />);
    await userEvent.click(toggle());
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
