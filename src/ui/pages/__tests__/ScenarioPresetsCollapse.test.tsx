// @vitest-environment jsdom
//
// ADR 0106 (#54): the Stress presets panel opens collapsed once a scenario is saved, so the
// compare starts higher on the page. The default is decided when the page opens; a manual
// Show / Hide wins for the app session.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Scenario } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

// The compare runs the engine; these tests only need the presets panel.
vi.mock("../ScenarioCompare", () => ({ CompareView: () => null }));

const sc = getDict("en").scenarios;

const saved = (id: string, name: string): Scenario => ({
  id,
  name,
  overrides: {},
});

const addScenario = vi.fn(async (s: Scenario) => {
  usePortfolioStore.setState((st) => ({ scenarios: [...st.scenarios, s] }));
  return { ok: true as const };
});

function seed(scenarios: Scenario[]) {
  act(() =>
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      scenarios,
      addScenario,
    }),
  );
}

const toggle = () =>
  screen.getByRole("button", {
    name: new RegExp(`^(${sc.showPresets}|${sc.hidePresets})$`),
  });
const presetButton = () => screen.queryByRole("button", { name: sc.plusPp(2) });

beforeEach(() => {
  addScenario.mockClear();
  act(() =>
    useUiStore.setState({
      language: "en",
      route: "scenarios",
      compareIds: [],
      compareBase: true,
      crashAtYear: 0,
      presetsOpen: null,
    }),
  );
});

describe("collapsible stress presets (#54)", () => {
  it("opens expanded when no scenario is saved", () => {
    seed([]);
    render(<Scenarios />);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(toggle().textContent).toBe(sc.hidePresets);
    expect(presetButton()).not.toBeNull();
  });

  it("opens collapsed once a scenario is saved, with a one-line summary", () => {
    seed([saved("a", "A")]);
    render(<Scenarios />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().textContent).toBe(sc.showPresets);
    expect(presetButton()).toBeNull();
    expect(screen.getByText(sc.presetsCollapsedSummary)).toBeTruthy();
  });

  it("the toggle controls the panel body", async () => {
    seed([saved("a", "A")]);
    render(<Scenarios />);
    const id = toggle().getAttribute("aria-controls");
    expect(id).toBeTruthy();
    await userEvent.click(toggle());
    expect(document.getElementById(id!)?.contains(presetButton())).toBe(true);
  });

  it("a manual Show sticks after leaving the page", async () => {
    seed([saved("a", "A")]);
    const first = render(<Scenarios />);
    await userEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(toggle());
    first.unmount();

    render(<Scenarios />);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(presetButton()).not.toBeNull();
  });

  it("a manual Hide sticks even with no saved scenario", async () => {
    seed([]);
    const first = render(<Scenarios />);
    await userEvent.click(toggle());
    expect(presetButton()).toBeNull();
    first.unmount();

    render(<Scenarios />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("saving the first preset keeps the panel open until the next visit", async () => {
    seed([]);
    const first = render(<Scenarios />);
    await userEvent.click(presetButton()!);
    expect(addScenario).toHaveBeenCalledTimes(1);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    first.unmount();

    render(<Scenarios />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });
});
