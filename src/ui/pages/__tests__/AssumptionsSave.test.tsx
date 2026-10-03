// @vitest-environment jsdom
//
// Assumptions save parsing (ADR 0074 typed values): every field is required, a blank or
// bad field shows its kind's format hint, and money defaults are 0 or more like every
// other form (ADR 0075, DR-176).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssumptionsPanel } from "../Assumptions";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Assumptions } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const save = vi.fn<(a: Assumptions) => Promise<{ ok: true }>>(async () => ({
  ok: true,
}));

beforeEach(() => {
  save.mockClear();
  act(() => {
    useUiStore.setState({ language: "en", route: "settings" });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      saveAssumptions: save,
    });
  });
});

const startsWith = (label: string) =>
  new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

async function setField(label: string, text: string) {
  const input = screen.getByLabelText(startsWith(label));
  await userEvent.clear(input);
  if (text) await userEvent.type(input, text);
}

describe("Assumptions save", () => {
  it("saves the parsed values", async () => {
    render(<AssumptionsPanel />);
    await setField(en.assumptions.other, "500");
    await setField(en.assumptions.inflation, "3");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0]![0];
    expect(next.defaults.otherYr.toString()).toBe("500");
    expect(next.inflationPa.toString()).toBe("0.03");
    expect(next.baseDate.getTime()).toBe(assumptions.baseDate.getTime());
    expect(next.horizonYears).toBe(assumptions.horizonYears);
    expect(
      next.defaults.propertyTaxYr.equals(assumptions.defaults.propertyTaxYr),
    ).toBe(true);
  });

  it("rejects a negative money default with the amount hint (ADR 0075)", async () => {
    render(<AssumptionsPanel />);
    await setField(en.assumptions.other, "-500");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(save).not.toHaveBeenCalled();
    const field = screen
      .getByLabelText(startsWith(en.assumptions.other))
      .closest(".field")!;
    expect(field.textContent).toContain(en.forms.invalidHint.money);
  });

  it("shows the format hint for a blank field and does not save", async () => {
    render(<AssumptionsPanel />);
    await setField(en.assumptions.inflation, "");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(save).not.toHaveBeenCalled();
    const field = screen
      .getByLabelText(startsWith(en.assumptions.inflation))
      .closest(".field")!;
    expect(field.textContent).toContain(en.forms.invalidHint.pct);
  });

  it("bounds the horizon to 1–100 years with the range hint (ADR 0075)", async () => {
    render(<AssumptionsPanel />);
    for (const years of ["0", "101"]) {
      await setField(en.assumptions.horizon, years);
      await userEvent.click(
        screen.getByRole("button", { name: en.common.saveChanges }),
      );
      expect(save).not.toHaveBeenCalled();
      const field = screen
        .getByLabelText(startsWith(en.assumptions.horizon))
        .closest(".field")!;
      expect(field.textContent).toContain(en.forms.intRange("1", "100"));
    }
  });
});
