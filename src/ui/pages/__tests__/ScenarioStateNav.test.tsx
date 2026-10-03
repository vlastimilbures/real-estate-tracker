// @vitest-environment jsdom
//
// ADR 0101 (#50): leaving Scenarios and coming back keeps the compare selection, the
// Base toggle and the crash timing; deleting a ticked scenario drops it from the
// selection.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Scenario } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

// The compare runs the engine; these tests only need the selection.
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

const saved = (id: string, name: string): Scenario => ({
  id,
  name,
  overrides: {},
  createdAt: new Date(Date.UTC(2026, 0, 1)),
});

function seed(scenarios: Scenario[]) {
  act(() =>
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      scenarios,
    }),
  );
}

const box = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;
const compared = () =>
  within(screen.getByRole("list", { name: "compared" }))
    .queryAllByRole("listitem")
    .map((li) => li.textContent);

beforeEach(() =>
  act(() =>
    useUiStore.setState({
      language: "en",
      route: "scenarios",
      compareIds: [],
      compareBase: true,
      crashAtYear: 0,
      // The crash timing lives in the presets panel, collapsed by default once
      // scenarios are saved (ADR 0106).
      presetsOpen: true,
    }),
  ),
);

describe("Scenarios state survives navigation (#50)", () => {
  it("keeps the selection, the Base toggle and the crash timing", async () => {
    seed([saved("a", "A"), saved("b", "B")]);
    const first = render(<Scenarios />);
    await userEvent.click(box("B"));
    await userEvent.click(box(sc.base));
    await userEvent.click(
      screen.getByRole("button", { name: en.common.plusYears(5) }),
    );
    first.unmount();

    render(<Scenarios />);
    expect(box("B").checked).toBe(true);
    expect(box("A").checked).toBe(false);
    expect(box(sc.base).checked).toBe(false);
    expect(compared()).toEqual(["B"]);
    expect(
      screen
        .getByRole("button", { name: en.common.plusYears(5) })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("drops a deleted scenario from the selection", async () => {
    seed([saved("a", "A"), saved("b", "B")]);
    render(<Scenarios />);
    await userEvent.click(box("A"));
    await userEvent.click(box("B"));
    act(() => usePortfolioStore.setState({ scenarios: [saved("b", "B")] }));
    expect(useUiStore.getState().compareIds).toEqual(["b"]);
    expect(compared()).toEqual([sc.base, "B"]);
  });
});
