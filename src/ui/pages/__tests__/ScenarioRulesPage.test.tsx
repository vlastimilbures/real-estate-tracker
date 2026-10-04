// @vitest-environment jsdom
//
// ADR 0123 (#107, #108), the Scenarios page wiring: a save the store refuses stays in the
// form with the rule on its field, and a stored row the app cannot read is listed and
// deleted through the store.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { WriteError } from "../../../state/writeError";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

// The compare runs the engine; these tests only need the form and the list.
vi.mock("../ScenarioCompare", () => ({ CompareView: () => null }));

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
const removeScenario = vi.fn(async (id: string) => {
  usePortfolioStore.setState((st) => ({
    unreadableScenarios: st.unreadableScenarios.filter((u) => u.id !== id),
  }));
  return { ok: true as const };
});

beforeEach(() => {
  addScenario.mockClear();
  removeScenario.mockClear();
  act(() => {
    useUiStore.setState({ language: "en", compareIds: [], compareBase: true });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      scenarios: [],
      unreadableScenarios: [{ id: "bad", name: "Broken" }],
      addScenario,
      removeScenario,
    });
  });
});

describe("Scenarios page (ADR 0123)", () => {
  it("keeps a refused new scenario in the form, with the rule on Value crash", async () => {
    render(<Scenarios />);
    await userEvent.click(
      screen.getAllByRole("button", { name: sc.newScenario })[0]!,
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

  it("lists an unreadable row and deletes it through the store", async () => {
    render(<Scenarios />);
    expect(screen.getByText(sc.unreadableRow)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.delete }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    expect(removeScenario).toHaveBeenCalledWith("bad");
    expect(screen.queryByText(sc.unreadableRow)).toBeNull();
  });
});
