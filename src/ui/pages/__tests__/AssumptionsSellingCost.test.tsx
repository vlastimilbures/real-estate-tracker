// @vitest-environment jsdom
//
// ADR 0183: the selling-cost rate is an Assumptions field (after the post-fixation reset
// rate, with help). Unset reads 0 %, a percentage saves as a fraction, and a rate outside
// 0–100 % is refused on its own field by the engine rule.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssumptionsPanel } from "../Assumptions";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { validateInputs, type Assumptions } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const save = vi.fn(async (a: Assumptions) => {
  const errors = validateInputs(portfolio, a);
  return errors.length > 0
    ? { ok: false as const, error: { kind: "input" as const, errors } }
    : { ok: true as const };
});

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

const field = () =>
  screen.getByLabelText(new RegExp(`^${en.assumptions.sellingCost}`));

async function saveWith(text: string) {
  await userEvent.clear(field());
  await userEvent.type(field(), text);
  await userEvent.click(
    screen.getByRole("button", { name: en.common.saveChanges }),
  );
}

describe("Assumptions — selling costs (ADR 0183)", () => {
  it("shows 0 % when unset, with its help text", () => {
    render(<AssumptionsPanel />);
    expect(field()).toHaveProperty("value", "0");
    expect(field().closest(".field")!.textContent).toContain(
      en.assumptions.sellingCostHelp,
    );
  });

  it("sits right after the post-fixation reset rate", () => {
    render(<AssumptionsPanel />);
    const labels = [...document.querySelectorAll(".field label")].map(
      (l) => l.textContent ?? "",
    );
    const reset = labels.findIndex((l) =>
      l.startsWith(en.assumptions.postFixationReset),
    );
    expect(labels[reset + 1]).toMatch(
      new RegExp(`^${en.assumptions.sellingCost}`),
    );
  });

  it("saves 3.5 % as 0.035", async () => {
    render(<AssumptionsPanel />);
    await saveWith("3.5");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].sellingCostPct?.toString()).toBe("0.035");
  });

  it("refuses 150 % on the field", async () => {
    render(<AssumptionsPanel />);
    await saveWith("150");
    expect(
      await screen.findByText(en.inputRules.RATE_OUT_OF_RANGE),
    ).toBeTruthy();
    expect(field().closest(".field")!.textContent).toContain(
      en.inputRules.RATE_OUT_OF_RANGE,
    );
  });
});
