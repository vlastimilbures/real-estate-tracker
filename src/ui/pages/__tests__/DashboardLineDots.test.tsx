// @vitest-environment jsdom
//
// ADR 0188: every line on the Dashboard, the LTV line included, marks the hovered year
// with the same small dot (r = 3).
import {
  describe,
  it,
  expect,
  afterAll,
  beforeAll,
  beforeEach,
  vi,
} from "vitest";
import { act, render } from "@testing-library/react";
import { portfolioProjection } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { projectionSeries } from "../../model/projection";
import { toChartRows, toEquityChangeRows } from "../../model/chartData";
import { TrajectoryCharts } from "../DashboardPanels";

const lines: { dataKey: string; activeDot?: unknown }[] = [];

vi.mock("recharts", async (importOriginal) => {
  const real = await importOriginal<typeof import("recharts")>();
  return {
    ...real,
    Line: (props: { dataKey: string; activeDot?: unknown }) => {
      lines.push(props);
      return null;
    },
  };
});

const realRect = HTMLElement.prototype.getBoundingClientRect;
const realMatchMedia = window.matchMedia;
beforeAll(() => {
  // Recharts draws nothing without a measured box; jsdom has none.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      width: 480,
      height: 196,
      top: 0,
      left: 0,
      right: 480,
      bottom: 196,
    }) as DOMRect;
  window.matchMedia = ((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
  window.matchMedia = realMatchMedia;
});
beforeEach(() => {
  lines.length = 0;
  act(() => useUiStore.setState({ language: "en" }));
});

describe("Dashboard line charts: hover dot (ADR 0188)", () => {
  it("every line, LTV included, has the r = 3 hover dot", () => {
    const series = projectionSeries(
      portfolioProjection(portfolio, assumptions),
      "nominal",
      assumptions,
    );
    render(
      <TrajectoryCharts
        mode="nominal"
        rows={toChartRows(series)}
        eqChange={toEquityChangeRows(series)}
        horizonYears={assumptions.horizonYears}
      />,
    );
    expect(lines.map((l) => l.dataKey)).toContain("ltv");
    for (const l of lines) expect(l.activeDot, l.dataKey).toEqual({ r: 3 });
  });
});
