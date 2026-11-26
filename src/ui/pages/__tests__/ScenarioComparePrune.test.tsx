// @vitest-environment jsdom
//
// The compare selection (uiStore, ADR 0101) keeps saved-scenario ids only: the page drops
// an id whose scenario is gone, and a scenario's box is disabled once the selection is
// full. Characterisation for #488, which moves the page's logic into a hook.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Scenarios } from "../Scenarios";
import { ScenarioListPanel } from "../ScenariosPanels";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../../state/portfolioStore";
import { MAX_COMPARE, useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Scenario } from "../../../engine";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

// The compare runs the engine; these tests only need the selection.
vi.mock("../ScenarioCompare", () => ({
  CompareView: () => null,
  ScenarioCompareView: () => null,
}));

const en = getDict("en");
const sc = en.scenarios;
const saved = (id: string): Scenario => ({
  id,
  name: id.toUpperCase(),
  overrides: {},
});
const box = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;

function seed(scenarios: Scenario[], compareIds: string[]) {
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      scenarios,
      removeScenario: async (id: string): Promise<MutationResult> => {
        usePortfolioStore.setState({
          scenarios: usePortfolioStore
            .getState()
            .scenarios.filter((s) => s.id !== id),
        });
        return { ok: true };
      },
    });
    useUiStore.setState({
      route: "scenarios",
      compareIds,
      compareBase: false,
    });
  });
}

beforeEach(() => expect(MAX_COMPARE).toBe(3));

describe("the compare selection on the Scenarios page", () => {
  it("drops an id whose scenario is gone when the page opens", () => {
    seed([saved("a"), saved("b"), saved("c"), saved("d")], ["gone", "a", "b"]);
    render(<Scenarios />);
    expect(useUiStore.getState().compareIds).toEqual(["a", "b"]);
    expect(screen.getByText(sc.comparedOf(2, 3))).toBeTruthy();
    expect(box("C").disabled).toBe(false);
    expect(box("D").disabled).toBe(false);
  });

  it("a full selection disables the unticked boxes, not the ticked ones", () => {
    seed([saved("a"), saved("b"), saved("c"), saved("d")], ["a", "b", "c"]);
    render(<Scenarios />);
    expect(screen.getByText(sc.comparedOf(3, 3))).toBeTruthy();
    expect(box("A").disabled).toBe(false);
    expect(box("D").disabled).toBe(true);
  });

  it("deleting a ticked scenario at the cap frees a place", async () => {
    seed([saved("a"), saved("b"), saved("c"), saved("d")], ["a", "b", "c"]);
    render(<Scenarios />);
    const user = userEvent.setup();
    const rowOf = (name: string) => box(name).closest("li")!;
    await user.click(
      within(rowOf("C")).getByRole("button", { name: en.common.delete }),
    );
    await user.click(screen.getByRole("button", { name: en.common.yesDelete }));
    expect(useUiStore.getState().compareIds).toEqual(["a", "b"]);
    expect(screen.getByText(sc.comparedOf(2, 3))).toBeTruthy();
    expect(box("D").disabled).toBe(false);
  });
});

describe("the list panel with an id not pruned yet", () => {
  // Known (#488): the hint counts only saved scenarios, the boxes count every id. The
  // page prunes in an effect right after the render, so the two differ for that render
  // only. Today's output is asserted; changing it is the owner's call.
  it("counts it for the cap but not for the hint", () => {
    seed([], []);
    render(
      <ScenarioListPanel
        scenarios={[saved("a"), saved("b"), saved("c")]}
        baseOn={false}
        onToggleBase={() => undefined}
        selectedIds={["gone", "a", "b"]}
        maxCompare={3}
        onToggle={() => undefined}
        busy={false}
        onEdit={() => undefined}
        onDuplicate={() => undefined}
        onDelete={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByText(sc.comparedOf(2, 3))).toBeTruthy();
    expect(box("C").disabled).toBe(true);
  });
});
