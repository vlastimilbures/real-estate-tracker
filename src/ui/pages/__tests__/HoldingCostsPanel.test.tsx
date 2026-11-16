// @vitest-environment jsdom
//
// ADR 0207 (#385): holding costs get a read view with Edit, like the other records.
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { money, rate, type HoldingCost } from "../../../engine";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { fmtCzk, fmtPct } from "../../../lib/format";
import type { MutationResult } from "../../../state/portfolioStore";
import { HoldingCostsPanel } from "../PropertyDetailPanels";

const p = en.propertyDetail;
const defaults = assumptions.defaults;
const holding: HoldingCost = {
  id: "h1",
  propertyId: "lipova",
  propertyTaxYr: money("2550"),
  svjMonthly: money("850"),
};

function renderPanel(
  onSave: (h: HoldingCost) => Promise<MutationResult> = async () => ({
    ok: true,
  }),
) {
  const onSaved = vi.fn();
  const save = vi.fn(onSave);
  render(
    <HoldingCostsPanel
      holding={holding}
      propertyId="lipova"
      defaults={defaults}
      onSave={save}
      onSaved={onSaved}
    />,
  );
  return { save, onSaved };
}

const edit = () => screen.getByRole("button", { name: p.editHoldingCosts });
const value = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

describe("Holding costs read view (ADR 0207 §1)", () => {
  it("shows no form at rest: the six values, a blank field as its default", () => {
    renderPanel();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: p.saveHoldingCosts }),
    ).toBeNull();
    expect(value(p.fieldPropertyTax)).toBe(fmtCzk(money("2550")));
    expect(value(p.fieldSvjMo)).toBe(fmtCzk(money("850")));
    expect(value(p.fieldInsurance)).toBe(
      `${fmtCzk(defaults.insuranceYr)} ${p.holdingDefault}`,
    );
    expect(value(p.fieldMgmtPct)).toBe(
      `${fmtPct(defaults.mgmtPctRent)} ${p.holdingDefault}`,
    );
  });

  it("marks the default in every language", () => {
    for (const [lang, t] of [
      ["cs", cs],
      ["ru", ru],
    ] as const) {
      act(() => useUiStore.setState({ language: lang }));
      const { unmount } = render(
        <HoldingCostsPanel
          holding={undefined}
          propertyId="lipova"
          defaults={defaults}
          onSave={async () => ({ ok: true })}
          onSaved={() => {}}
        />,
      );
      expect(screen.getAllByText(t.propertyDetail.holdingDefault).length).toBe(
        6,
      );
      expect(
        screen.getByText(t.propertyDetail.fieldInsurance, { selector: "dt" })
          .nextElementSibling?.textContent,
      ).toBe(
        `${fmtCzk(defaults.insuranceYr)} ${t.propertyDetail.holdingDefault}`,
      );
      unmount();
    }
  });
});

describe("Holding costs Edit (ADR 0207 §2, §3)", () => {
  it("Edit opens the form in place with focus on its first field; Cancel restores the read view and focus", async () => {
    renderPanel();
    await userEvent.click(edit());
    const tax = screen.getByLabelText(p.fieldPropertyTax, { exact: false });
    expect(document.activeElement).toBe(tax);
    expect(
      screen.queryByRole("button", { name: p.editHoldingCosts }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: p.saveHoldingCosts }).className,
    ).toContain("primary");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(edit());
  });

  it("Save writes the record, says so, and returns to the read view with focus on Edit", async () => {
    const { save, onSaved } = renderPanel();
    await userEvent.click(edit());
    const other = screen.getByLabelText(p.fieldOther, { exact: false });
    await userEvent.type(other, "1200");
    await userEvent.click(
      screen.getByRole("button", { name: p.saveHoldingCosts }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "h1",
        propertyId: "lipova",
        otherYr: money("1200"),
        insuranceYr: undefined,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(edit());
  });

  it("a failed write keeps the form open with the message and focus in place", async () => {
    const { onSaved } = renderPanel(async () => ({
      ok: false,
      error: { kind: "other", message: "Disk full" },
    }));
    await userEvent.click(edit());
    const save = screen.getByRole("button", { name: p.saveHoldingCosts });
    await userEvent.click(save);
    expect(screen.getByText(/Disk full/)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText(p.fieldOther, { exact: false })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: p.editHoldingCosts }),
    ).toBeNull();
    expect(document.activeElement).toBe(save);
  });

  it("a value that does not parse is refused in the form, as before", async () => {
    const { save } = renderPanel();
    await userEvent.click(edit());
    const other = screen.getByLabelText(p.fieldOther, { exact: false });
    await userEvent.type(other, "abc");
    await userEvent.click(
      screen.getByRole("button", { name: p.saveHoldingCosts }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(other.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.queryByRole("button", { name: p.editHoldingCosts }),
    ).toBeNull();
  });

  it("edits in the form hold a navigation at the leave guard", async () => {
    renderPanel();
    act(() => useUiStore.setState({ route: "property" }));
    await userEvent.click(edit());
    await userEvent.type(
      screen.getByLabelText(p.fieldOther, { exact: false }),
      "5",
    );
    expect(useUiStore.getState().unsavedChanges).toBe(true);
    act(() => useUiStore.getState().navigate("dashboard"));
    expect(useUiStore.getState().pendingLeave).not.toBeNull();
    expect(useUiStore.getState().route).toBe("property");
    act(() => useUiStore.getState().cancelLeave());
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(useUiStore.getState().unsavedChanges).toBe(false);
  });

  it("a slow save that lands after a refresh still returns to the read view and the pencil", async () => {
    let resolve: (r: MutationResult) => void = () => {};
    const { rerender } = render(
      <HoldingCostsPanel
        holding={holding}
        propertyId="lipova"
        defaults={defaults}
        onSave={() => new Promise((r) => (resolve = r))}
        onSaved={() => {}}
      />,
    );
    await userEvent.click(edit());
    await userEvent.click(
      screen.getByRole("button", { name: p.saveHoldingCosts }),
    );
    rerender(
      <HoldingCostsPanel
        holding={{ ...holding, otherYr: money("100") }}
        propertyId="lipova"
        defaults={defaults}
        onSave={async () => ({ ok: true })}
        onSaved={() => {}}
      />,
    );
    await act(async () => resolve({ ok: true }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(value(p.fieldOther)).toBe(fmtCzk(money("100")));
    expect(document.activeElement).toBe(edit());
  });

  it("leaves focus alone when it moved elsewhere during the save", async () => {
    let resolve: (r: MutationResult) => void = () => {};
    render(
      <>
        <HoldingCostsPanel
          holding={holding}
          propertyId="lipova"
          defaults={defaults}
          onSave={() => new Promise((r) => (resolve = r))}
          onSaved={() => {}}
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    await userEvent.click(edit());
    await userEvent.click(
      screen.getByRole("button", { name: p.saveHoldingCosts }),
    );
    const other = screen.getByRole("button", { name: "Elsewhere" });
    act(() => other.focus());
    await act(async () => resolve({ ok: true }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(other);
  });

  it("the pencil sits in the panel head", () => {
    const { container } = render(
      <HoldingCostsPanel
        holding={holding}
        propertyId="lipova"
        defaults={defaults}
        onSave={async () => ({ ok: true })}
        onSaved={() => {}}
      />,
    );
    const head = container.querySelector(".panel-head") as HTMLElement;
    expect(
      within(head).getByRole("button", { name: p.editHoldingCosts }),
    ).toBeTruthy();
  });
});

// The rates on the form read as percentages and parse back to the stored shares.
describe("Holding costs form values", () => {
  it("opens with the stored values as drafts", async () => {
    render(
      <HoldingCostsPanel
        holding={{ ...holding, mgmtPctRent: rate("0.15") }}
        propertyId="lipova"
        defaults={defaults}
        onSave={async () => ({ ok: true })}
        onSaved={() => {}}
      />,
    );
    await userEvent.click(edit());
    expect(
      (
        screen.getByLabelText(p.fieldMgmtPct, {
          exact: false,
        }) as HTMLInputElement
      ).value,
    ).toBe("15");
  });
});
