// @vitest-environment jsdom
//
// ADR 0207 (#385): holding costs get a read view with Edit, like the other records.
import { describe, it, expect, beforeEach, vi } from "vitest";
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

beforeEach(() =>
  act(() =>
    useUiStore.setState({
      language: "en",
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    }),
  ),
);

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

  it("a failed write keeps the form open with the message", async () => {
    renderPanel(async () => ({
      ok: false,
      error: { kind: "other", message: "Disk full" },
    }));
    await userEvent.click(edit());
    await userEvent.click(
      screen.getByRole("button", { name: p.saveHoldingCosts }),
    );
    expect(screen.getByText(/Disk full/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: p.saveHoldingCosts }),
    ).toBeTruthy();
  });

  it("edits in the form are unsaved changes for the leave guard", async () => {
    renderPanel();
    await userEvent.click(edit());
    await userEvent.type(
      screen.getByLabelText(p.fieldOther, { exact: false }),
      "5",
    );
    expect(useUiStore.getState().unsavedChanges).toBe(true);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(useUiStore.getState().unsavedChanges).toBe(false);
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
