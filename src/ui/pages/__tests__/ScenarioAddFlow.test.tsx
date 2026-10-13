// @vitest-environment jsdom
//
// ADR 0093: clicking a saved preset again creates no duplicate row (#48), and a newly
// added scenario is ticked for compare while fewer than 3 are ticked (#49).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// The toast region sits beside the page, in the app frame (ADR 0189).
import { ToastRegion } from "../../components/OutcomeRegions";
import { Scenarios } from "../Scenarios";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Scenario } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { ratePreset as presetOf } from "../../model/scenarios";

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
const rateSettings = presetOf(2, en).overrides;

const saved = (
  id: string,
  name: string,
  overrides: Scenario["overrides"] = {},
): Scenario => ({ id, name, overrides });

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
const duplicateScenario = vi.fn(
  async (id: string, newId: string, name: string) => {
    usePortfolioStore.setState((st) => {
      const src = st.scenarios.find((x) => x.id === id)!;
      return {
        scenarios: [...st.scenarios, { ...src, id: newId, name }],
      };
    });
    return { ok: true as const };
  },
);

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
  act(() =>
    useUiStore.setState({
      language: "en",
      route: "scenarios",
      compareIds: [],
      compareBase: true,
      crashAtYear: 0,
      // These tests click presets with scenarios saved; the collapse default is
      // covered in ScenarioPresetsCollapse.test.tsx (ADR 0106).
      presetsOpen: true,
    }),
  );
});

describe("stress presets do not save duplicates (#48)", () => {
  it("a second click on the same preset adds no row", async () => {
    seed([]);
    render(
      <>
        <Scenarios />
        <ToastRegion />
      </>,
    );
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
    seed([saved("s1", ratePreset, rateSettings)]);
    render(
      <>
        <Scenarios />
        <ToastRegion />
      </>,
    );
    expect(box(ratePreset).checked).toBe(false);
    await clickPreset();
    expect(addScenario).not.toHaveBeenCalled();
    expect(box(ratePreset).checked).toBe(true);
    expect(compared()).toEqual([sc.base, ratePreset]);
  });
});

// ADR 0191 §3 (#162): presets match by settings; the toast names the saved scenario.
describe("a preset matches a saved scenario by its settings (#162)", () => {
  const page = () =>
    render(
      <>
        <Scenarios />
        <ToastRegion />
      </>,
    );

  it("a renamed preset is still found, and the toast names it", async () => {
    seed([saved("s1", "My rate test", rateSettings)]);
    page();
    await clickPreset();
    expect(addScenario).not.toHaveBeenCalled();
    expect(box("My rate test").checked).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(
      sc.alreadySaved("My rate test"),
    );
  });

  it("a scenario with the preset's name but other settings does not block it", async () => {
    const fiveYears = {
      rateShock: { ...rateSettings.rateShock!, durationYears: 5 },
    };
    seed([saved("s1", ratePreset, fiveYears)]);
    page();
    await clickPreset();
    expect(addScenario).toHaveBeenCalledWith(
      expect.objectContaining({ name: ratePreset, overrides: rateSettings }),
    );
    expect(screen.getAllByRole("checkbox", { name: ratePreset })).toHaveLength(
      2,
    );
  });
});

describe("a new scenario joins the compare (#49)", () => {
  it("ticks a scenario added from a preset", async () => {
    seed([]);
    render(
      <>
        <Scenarios />
        <ToastRegion />
      </>,
    );
    await clickPreset();
    expect(box(ratePreset).checked).toBe(true);
    expect(compared()).toEqual([sc.base, ratePreset]);
    expect(screen.getByRole("status").textContent).toBe(
      sc.addedScenario(ratePreset),
    );
  });

  it("at the limit keeps the selection and says why", async () => {
    seed([saved("a", "A"), saved("b", "B"), saved("c", "C")]);
    render(
      <>
        <Scenarios />
        <ToastRegion />
      </>,
    );
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
    render(
      <>
        <Scenarios />
        <ToastRegion />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: sc.duplicate }));
    expect(duplicateScenario).toHaveBeenCalledTimes(1);
    const newId = duplicateScenario.mock.calls[0]![1];
    expect(newId).not.toBe("a");
    expect(box("A (copy)").checked).toBe(true);
    expect(box("A").checked).toBe(false);
  });

  it("ticks a scenario created with the form", async () => {
    seed([]);
    render(
      <>
        <Scenarios />
        <ToastRegion />
      </>,
    );
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
    render(
      <>
        <Scenarios />
        <ToastRegion />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
    const name = screen.getByLabelText(sc.name);
    await userEvent.clear(name);
    await userEvent.type(name, "A2");
    await userEvent.click(screen.getByRole("button", { name: en.common.save }));
    expect(saveScenario).toHaveBeenCalledTimes(1);
    expect(box("A2").checked).toBe(false);
  });
});
