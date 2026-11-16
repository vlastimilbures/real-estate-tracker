// @vitest-environment jsdom
//
// ADR 0216 (#388): Scenario compare's three charts share one row (a grid that never
// leaves a cell empty), at the small-multiple height; the key figures are a flush data
// table with a pinned metric column.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  applyScenario,
  cpiIndex,
  portfolioKpis,
  portfolioProjection,
  realProjection,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import type { CompareResult } from "../../model/compare";
import { SMALL_CHART_HEIGHT } from "../../components/charts";

function result(id: string, name: string): CompareResult {
  const assn = applyScenario(assumptions, {});
  const projection = portfolioProjection(portfolio, assn);
  return {
    id,
    name,
    projection,
    realProjection: realProjection(projection, cpiIndex(assn)),
    kpis: portfolioKpis(portfolio, assn),
  };
}

const results: CompareResult[] = [result("base", "Base"), result("a", "A")];
vi.mock("../../../state/useEngine", () => ({
  useScenarioComparison: () => results,
}));

const { CompareView } = await import("../ScenarioCompare");

const selected = results.map((r) => ({
  id: r.id,
  name: r.name,
  overrides: {},
}));

describe("charts (ADR 0216 §1)", () => {
  it("three charts in the trio grid, inside a container-query wrap", () => {
    const { container } = render(<CompareView selected={selected} />);
    const grid = container.querySelector(".chart-grid-wrap > .chart-grid.trio");
    expect(grid).not.toBeNull();
    expect(grid!.children).toHaveLength(3);
  });

  it("each at the Dashboard's small-multiple height", () => {
    expect(SMALL_CHART_HEIGHT).toBe(180);
    const { container } = render(<CompareView selected={selected} />);
    const plots = [
      ...container.querySelectorAll<HTMLElement>(
        ".chart-grid.trio .recharts-responsive-container",
      ),
    ];
    expect(plots).toHaveLength(3);
    for (const p of plots)
      expect(p.style.height).toBe(`${SMALL_CHART_HEIGHT}px`);
  });
});

describe("key figures table (ADR 0216 §2)", () => {
  it("is a flush data table with a pinned metric column", () => {
    render(<CompareView selected={selected} />);
    const table = screen.getByRole("table", {
      name: en.scenarios.keyFiguresTitle,
    });
    expect(table.classList.contains("data")).toBe(true);
    expect(table.closest(".panel-body")?.classList.contains("flush")).toBe(
      true,
    );
    expect(table.closest(".table-wrap")).not.toBeNull();
    const rowHeads = table.querySelectorAll("tbody th[scope=row]");
    expect(rowHeads.length).toBeGreaterThan(0);
    for (const th of rowHeads)
      expect(th.classList.contains("sticky-col")).toBe(true);
    expect(
      table
        .querySelector("thead th, thead td")!
        .classList.contains("sticky-col"),
    ).toBe(true);
  });
});
