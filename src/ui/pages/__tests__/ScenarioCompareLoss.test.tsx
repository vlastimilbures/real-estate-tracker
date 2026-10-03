// @vitest-environment jsdom
//
// ADR 0089 (#14): with Base and a price crash at Today, the Compare key figures show
// starting equity and Δ net worth vs Base, and mark the crash's rebased returns with a
// footnote. A scenario with Base's starting equity gets no marker and no footnote.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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
const rateShock = result("rate", "Rate shock", {
  rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
});

let results: CompareResult[] = [];
vi.mock("../../../state/useEngine", () => ({
  useScenarioComparison: () => results,
}));

const { CompareView } = await import("../ScenarioCompare");

beforeEach(() =>
  act(() => useUiStore.setState({ language: "en", mode: "nominal" })),
);

const cellsOf = (label: string) => {
  const row = screen.getByRole("rowheader", { name: label });
  return within(row.closest("tr")!).getAllByRole("cell");
};

describe("Compare owner loss (ADR 0089)", () => {
  it("shows starting equity, Δ net worth and the rebased-returns footnote", () => {
    results = [base, crash];
    render(<CompareView selected={[]} />);
    const start = cellsOf(en.scenarios.kpiStartingEquity);
    expect(start.map((c) => c.textContent)).toEqual(["19,2 M Kč", "13,5 M Kč"]);
    const delta = cellsOf(en.scenarios.kpiNetWorthDeltaVsBase);
    expect(delta.map((c) => c.textContent)).toEqual(["—", "−18,6 M Kč"]);

    const note = screen.getByText(
      en.scenarios.rebasedReturnsFootnote("Price crash"),
    );
    const multiple = cellsOf(en.scenarios.kpiNetWorthMultiple);
    expect(multiple[1]!.getAttribute("aria-describedby")).toBe(
      note.closest("p")!.id,
    );
    expect(multiple[0]!.getAttribute("aria-describedby")).toBeNull();
  });

  it("a rate shock keeps Base's starting equity: no marker, no footnote", () => {
    results = [base, rateShock];
    const { container } = render(<CompareView selected={[]} />);
    expect(container.querySelector(".ct-footnote")).toBeNull();
    expect(container.querySelector(".ct-mark")).toBeNull();
  });
});
