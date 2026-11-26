// @vitest-environment jsdom
//
// ADR 0262 §2 (#489): a dirty property or scenario dialog is known to the leave guard. Each
// real way out of the dialog leaves no entry behind: Cancel, ✕, a successful save, and
// Discard on the leave prompt (which also closes the dialog with its page).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { Properties } from "../Properties";
import { LeaveGuard } from "../../components/LeaveGuard";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import type { Scenario } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { success } from "../../../__tests__/support/result";
import { en } from "../../../i18n/en";

// The compare runs the engine; these tests only need the dialog.
vi.mock("../ScenarioCompare", () => ({ ScenarioCompareView: () => null }));

const sources = () => useUiStore.getState().unsavedSources;
const addScenario = vi.fn(async (s: Scenario) => {
  usePortfolioStore.setState((st) => ({ scenarios: [...st.scenarios, s] }));
  return { ok: true as const };
});

beforeEach(() => {
  addScenario.mockClear();
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      addScenario,
      getPropertyExtras: () =>
        Promise.resolve(success({ address: null, garage: null })),
    });
    useUiStore.setState({
      route: "scenarios",
    });
  });
});

/** The scenario dialog, opened from its page and typed in. */
async function dirtyScenario() {
  await userEvent.click(
    screen.getByRole("button", { name: en.scenarios.addScenario }),
  );
  await userEvent.type(screen.getByLabelText(en.scenarios.name), "Crash");
  expect(sources()).toHaveLength(1);
}

describe("the scenario dialog leaves no leave-guard entry (ADR 0262 §2)", () => {
  it("after Cancel", async () => {
    render(<Scenarios />);
    await dirtyScenario();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sources()).toEqual([]);
  });

  it("after a successful save", async () => {
    render(<Scenarios />);
    await dirtyScenario();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );
    expect(addScenario).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sources()).toEqual([]);
  });

  it("after Discard on the leave prompt, which closes the dialog with its page", async () => {
    // The page shows only on its route, as in the app shell.
    function Shell() {
      const route = useUiStore((s) => s.route);
      return (
        <>
          {route === "scenarios" && <Scenarios />}
          <LeaveGuard />
        </>
      );
    }
    render(<Shell />);
    await dirtyScenario();
    act(() => useUiStore.getState().navigate("dashboard"));
    expect(
      screen.getByRole("dialog", { name: en.common.unsavedTitle }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.discardChanges }),
    );
    expect(useUiStore.getState().route).toBe("dashboard");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sources()).toEqual([]);
  });
});

describe("the property dialog leaves no leave-guard entry (ADR 0262 §2)", () => {
  async function dirtyProperty() {
    act(() =>
      useUiStore.setState({ route: "properties", newPropertyRequested: true }),
    );
    render(<Properties />);
    await userEvent.type(
      screen.getByLabelText(en.propertyForm.name),
      "Byt Nový",
    );
    expect(sources()).toHaveLength(1);
  }

  it("after ✕", async () => {
    await dirtyProperty();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.close }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sources()).toEqual([]);
  });

  it("after Cancel", async () => {
    await dirtyProperty();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sources()).toEqual([]);
  });
});
