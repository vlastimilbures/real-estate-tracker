// @vitest-environment jsdom
//
// ADR 0093: clicking a saved preset again creates no duplicate row (#48), and a newly
// added scenario is ticked for compare while fewer than 3 are ticked (#49).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Scenario } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

// The compare runs the engine; these tests only need the list and the selection.
vi.mock("../ScenarioCompare", () => ({
  CompareView: ({ selected }: { selected: Scenario[] }) => (
    <ul aria-label="compared">
      {selected.map((s) => (
        <li key={s.id}>{s.name}</li>
      ))}
    </ul>
  ),
}));

const en = getDict("en");
const sc = en.scenarios;
const ratePreset = sc.rateForYears(sc.plusPp(2), 3);

const saved = (id: string, name: string): Scenario => ({
  id,
  name,
  overrides: {},
  createdAt: new Date(Date.UTC(2026, 0, 1)),
});

const addScenario = vi.fn(async (s: Scenario) => {
  usePortfolioStore.setState((st) => ({ scenarios: [...st.scenarios, s] }));
  return { ok: true as const };
});
const saveScenario = vi.fn(async (s: Scenario) => {
  usePortfolioStore.setState((st) => ({
    scenarios: st.scenarios.map((x) => (x.id === s.id ? s : x)),
  }));
  return { ok: true as const };
});
const duplicateScenario = vi.fn(async (id: string, newId: string) => {
  usePortfolioStore.setState((st) => {
    const src = st.scenarios.find((x) => x.id === id)!;
    return {
      scenarios: [
        ...st.scenarios,
        { ...src, id: newId, name: `${src.name} (copy)` },
      ],
    };
  });
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
      saveScenario,
      duplicateScenario,
    }),
  );
}

const box = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;
const compared = () =>
  within(screen.getByRole("list", { name: "compared" }))
    .queryAllByRole("listitem")
    .map((li) => li.textContent);
const clickPreset = () =>
  userEvent.click(screen.getByRole("button", { name: sc.plusPp(2) }));

beforeEach(() => {
  addScenario.mockClear();
  saveScenario.mockClear();
  duplicateScenario.mockClear();
  act(() => useUiStore.setState({ language: "en", route: "scenarios" }));
});

describe("stress presets do not save duplicates (#48)", () => {
  it("a second click on the same preset adds no row", async () => {
    seed([]);
    render(<Scenarios />);
    await clickPreset();
    await clickPreset();
    expect(addScenario).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("checkbox", { name: ratePreset })).toHaveLength(
      1,
    );
    expect(screen.getByRole("status").textContent).toBe(
      sc.alreadySaved(ratePreset),
    );
  });

  it("a preset that matches a saved scenario ticks it for compare", async () => {
    seed([saved("s1", ratePreset)]);
    render(<Scenarios />);
    expect(box(ratePreset).checked).toBe(false);
    await clickPreset();
    expect(addScenario).not.toHaveBeenCalled();
    expect(box(ratePreset).checked).toBe(true);
    expect(compared()).toEqual([sc.base, ratePreset]);
  });
});

describe("a new scenario joins the compare (#49)", () => {
  it("ticks a scenario added from a preset", async () => {
    seed([]);
    render(<Scenarios />);
    await clickPreset();
    expect(box(ratePreset).checked).toBe(true);
    expect(compared()).toEqual([sc.base, ratePreset]);
    expect(screen.getByRole("status").textContent).toBe(
      sc.addedScenario(ratePreset),
    );
  });

  it("at the limit keeps the selection and says why", async () => {
    seed([saved("a", "A"), saved("b", "B"), saved("c", "C")]);
    render(<Scenarios />);
    for (const n of ["A", "B", "C"]) await userEvent.click(box(n));
    await clickPreset();
    expect(addScenario).toHaveBeenCalledTimes(1);
    expect(box(ratePreset).checked).toBe(false);
    expect(compared()).toEqual([sc.base, "A", "B", "C"]);
    expect(screen.getByRole("status").textContent).toBe(
      sc.addedCompareFull(ratePreset, 3),
    );
  });

  it("ticks a duplicate", async () => {
    seed([saved("a", "A")]);
    render(<Scenarios />);
    await userEvent.click(screen.getByRole("button", { name: sc.duplicate }));
    expect(duplicateScenario).toHaveBeenCalledTimes(1);
    const newId = duplicateScenario.mock.calls[0]![1];
    expect(newId).not.toBe("a");
    expect(box("A (copy)").checked).toBe(true);
    expect(box("A").checked).toBe(false);
  });

  it("ticks a scenario created with the form", async () => {
    seed([]);
    render(<Scenarios />);
    await userEvent.click(screen.getByRole("button", { name: sc.newScenario }));
    await userEvent.type(screen.getByLabelText(sc.name), "Mine");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );
    expect(addScenario).toHaveBeenCalledTimes(1);
    expect(box("Mine").checked).toBe(true);
  });

  it("editing a scenario does not change the selection", async () => {
    seed([saved("a", "A")]);
    render(<Scenarios />);
    await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
    const name = screen.getByLabelText(sc.name);
    await userEvent.clear(name);
    await userEvent.type(name, "A2");
    await userEvent.click(screen.getByRole("button", { name: en.common.save }));
    expect(saveScenario).toHaveBeenCalledTimes(1);
    expect(box("A2").checked).toBe(false);
  });
});
