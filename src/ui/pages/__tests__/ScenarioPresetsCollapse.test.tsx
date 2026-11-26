// @vitest-environment jsdom
//
// ADR 0106 (#54), amended by ADR 0220 (#417): the presets are an "Add from preset"
// disclosure in the Scenarios panel, closed once a scenario is saved, so the compare starts
// higher on the page. The default is decided when the page opens; a manual open or close
// wins for the app session.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { ScenarioListPanel } from "../ScenariosPanels";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Scenario } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

// The compare runs the engine; these tests only need the presets panel.
vi.mock("../ScenarioCompare", () => ({ ScenarioCompareView: () => null }));

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
      status: { kind: "ready" },
      scenarios,
      addScenario,
    }),
  );
}

const toggle = () => screen.getByRole("button", { name: sc.addFromPreset });
const presetButton = () => screen.queryByRole("button", { name: sc.plusPp(2) });

beforeEach(() => {
  addScenario.mockClear();
  act(() =>
    useUiStore.setState({
      route: "scenarios",
    }),
  );
});

describe("collapsible stress presets (#54)", () => {
  it("opens expanded when no scenario is saved", () => {
    seed([]);
    render(<Scenarios />);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(presetButton()).not.toBeNull();
  });

  it("opens closed once a scenario is saved; the disclosure says what it adds", () => {
    seed([saved("a", "A")]);
    render(<Scenarios />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(presetButton()).toBeNull();
  });

  it("is in the Scenarios panel's head: one panel above the compare (ADR 0220 §1)", () => {
    seed([saved("a", "A")]);
    render(<Scenarios />);
    const panels = document.querySelectorAll("section.panel");
    expect(panels).toHaveLength(1);
    const head = panels[0]!.querySelector(".panel-head")!;
    expect(head.querySelector("h2")?.textContent).toBe(sc.listTitle);
    expect(head.contains(toggle())).toBe(true);
    // The presets open above the list (ADR 0220 §3): a saved preset's new row does not
    // move them, and they come before the rows in Tab order.
    const region = document.getElementById(
      toggle().getAttribute("aria-controls")!,
    )!;
    const list = panels[0]!.querySelector(".scenario-list")!;
    expect(
      list.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it("the head counts the compared scenarios; Base does not count", () => {
    seed([saved("a", "A"), saved("b", "B")]);
    act(() => useUiStore.setState({ compareIds: ["a"] }));
    render(<Scenarios />);
    const head = document.querySelector("section.panel .panel-head")!;
    expect(head.querySelector(".hint")?.textContent).toBe(sc.comparedOf(1, 3));
  });

  it("counts only saved scenarios: an id not yet pruned is not counted", () => {
    render(
      <ScenarioListPanel
        list={{
          scenarios: [saved("a", "A")],
          baseOn: true,
          selectedIds: ["a", "ghost"],
          busy: false,
        }}
        actions={{
          toggleBase: () => undefined,
          toggle: () => undefined,
          edit: () => undefined,
          duplicate: () => undefined,
          remove: () => Promise.resolve({ ok: true as const }),
        }}
      />,
    );
    const head = document.querySelector("section.panel .panel-head")!;
    expect(head.querySelector(".hint")?.textContent).toBe(sc.comparedOf(1, 3));
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
