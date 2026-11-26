// @vitest-environment jsdom
//
// ADR 0089 (#14): with Base and a price crash at Today, the Compare key figures show
// starting equity and Δ net worth vs Base, and mark the crash's rebased returns with a
// footnote. A scenario with Base's starting equity gets no marker and no footnote.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { rate } from "../../../engine";
import { en } from "../../../i18n/en";
import type { CompareResult } from "../../model/compare";
import {
  compareResult,
  mockScenarioComparison,
} from "../../__tests__/support/compareResult";

const base = compareResult("base", "Base");
const crash = compareResult("crash", "Price crash", {
  valueShock: { pct: rate("0.2"), atYear: 0 },
});
const rateShock = compareResult("rate", "Rate shock", {
  rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
});

let results: CompareResult[] = [];
vi.mock("../../../state/useEngine", () =>
  mockScenarioComparison(() => results),
);

const { ScenarioCompareView } = await import("../ScenarioCompare");

const cellsOf = (label: string) => {
  const row = screen.getByRole("rowheader", { name: label });
  return within(row.closest("tr")!).getAllByRole("cell");
};

describe("Compare owner loss (ADR 0089)", () => {
  it("shows starting equity, Δ net worth and the rebased-returns footnote", () => {
    results = [base, crash];
    render(<ScenarioCompareView selected={[]} />);
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
    const { container } = render(<ScenarioCompareView selected={[]} />);
    expect(container.querySelector(".ct-footnote")).toBeNull();
    expect(container.querySelector(".ct-mark")).toBeNull();
  });
});
