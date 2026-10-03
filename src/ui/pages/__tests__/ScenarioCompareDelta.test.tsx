// @vitest-environment jsdom
//
// ADR 0097 (#53): with Base in the comparison, the Key figures panel can switch every
// cell to the scenario's difference to Base. Without Base there is no toggle.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  applyScenario,
  cpiIndex,
  portfolioKpis,
  portfolioProjection,
  rate,
  realProjection,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import type { CompareResult } from "../../model/compare";

function result(id: string, name: string, overrides = {}): CompareResult {
  const assn = applyScenario(assumptions, overrides);
  const projection = portfolioProjection(portfolio, assn);
  return {
    id,
    name,
    projection,
    realProjection: realProjection(projection, cpiIndex(assn)),
    kpis: portfolioKpis(portfolio, assn),
  };
}

const base = result("base", "Base");
const crash = result("crash", "Price crash", {
  valueShock: { pct: rate("0.2"), atYear: 0 },
});

let results: CompareResult[] = [];
vi.mock("../../../state/useEngine", () => ({
  useScenarioComparison: () => results,
}));

const { CompareView } = await import("../ScenarioCompare");

beforeEach(() =>
  act(() => useUiStore.setState({ language: "en", mode: "nominal" })),
);

const sc = en.scenarios;
const cellsOf = (label: string) => {
  const row = screen.getByRole("rowheader", { name: label });
  return within(row.closest("tr")!)
    .getAllByRole("cell")
    .map((c) => c.textContent);
};
const toggle = () => screen.queryByRole("group", { name: sc.viewToggleLabel });

describe("Compare Δ vs Base view (ADR 0097)", () => {
  it("switches the key figures to the difference to Base", async () => {
    results = [base, crash];
    render(<CompareView selected={[]} />);
    const values = screen.getByRole("button", { name: sc.viewValues });
    expect(values.getAttribute("aria-pressed")).toBe("true");
    expect(cellsOf(sc.kpiNetWorthNominal)[1]).toBe("74,5 M Kč");

    await userEvent.click(
      screen.getByRole("button", { name: sc.viewDeltaVsBase }),
    );
    expect(cellsOf(sc.kpiNetWorthNominal)).toEqual(["—", "−18,6 M Kč"]);
    expect(
      screen.queryByRole("rowheader", { name: sc.kpiNetWorthDeltaVsBase }),
    ).toBeNull();
    expect(
      screen.getByText(sc.rebasedReturnsFootnote("Price crash")),
    ).toBeTruthy();
  });

  it("without Base there is no toggle and the table shows values", async () => {
    results = [base, crash];
    const { rerender } = render(<CompareView selected={[]} />);
    await userEvent.click(
      screen.getByRole("button", { name: sc.viewDeltaVsBase }),
    );
    results = [crash];
    rerender(<CompareView selected={[]} />);
    expect(toggle()).toBeNull();
    expect(cellsOf(sc.kpiNetWorthNominal)).toEqual(["74,5 M Kč"]);
  });
});
