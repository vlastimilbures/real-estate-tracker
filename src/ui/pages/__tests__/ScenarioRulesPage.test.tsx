// @vitest-environment jsdom
//
// ADR 0123 (#107, #108), the Scenarios page wiring: a save the store refuses stays in the
// form with the rule on its field.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { getDict } from "../../../i18n";
import type { WriteError } from "../../../state/writeError";

// The compare runs the engine; these tests only need the form and the list.
vi.mock("../ScenarioCompare", () => ({ ScenarioCompareView: () => null }));

const en = getDict("en");
const sc = en.scenarios;

const refused: WriteError = {
  kind: "input",
  errors: [
    { code: "SHOCK_OUT_OF_RANGE", entity: "assumptions", field: "valueShock" },
  ],
};
const addScenario = vi.fn(
  async (): Promise<{
    ok: false;
    error: WriteError;
  }> => ({
    ok: false as const,
    error: refused,
  }),
);
beforeEach(() => {
  addScenario.mockClear();
  act(() => {
    usePortfolioStore.setState({ addScenario });
  });
});

describe("Scenarios page (ADR 0123)", () => {
  it("keeps a refused new scenario in the form, with the rule on Value crash", async () => {
    renderWithPortfolio(<Scenarios />);
    await userEvent.click(
      screen.getAllByRole("button", { name: sc.addScenario })[0]!,
    );
    await userEvent.type(screen.getByLabelText(sc.name), "Crash");
    await userEvent.type(screen.getByLabelText(sc.fieldValueCrash), "-20");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );

    expect(addScenario).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByLabelText(sc.fieldValueCrash).getAttribute("aria-invalid"),
    ).toBe("true");
  });
});
