// @vitest-environment jsdom
//
// #170: the signed and stacked chart shapes of the one ChartCard API. Net cash flow bars
// are green above zero and red below (a gap counts as zero); a stacked tooltip can add
// the net of the stack.
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
import type { ReactElement } from "react";
import { ChartCard } from "../charts";
import { SERIES } from "../../model/chartData";
import { useUiStore } from "../../../state/uiStore";

type TooltipProps = {
  content?: (p: {
    active: boolean;
    label: number;
    payload: { dataKey: string; value: number | null; color: string }[];
  }) => ReactElement;
};
const tooltips: TooltipProps[] = [];
const fills: string[] = [];

vi.mock("recharts", async (importOriginal) => {
  const real = await importOriginal<typeof import("recharts")>();
  return {
    ...real,
    Tooltip: (props: TooltipProps) => {
      tooltips.push(props);
      return null;
    },
    Cell: (props: { fill: string }) => {
      fills.push(props.fill);
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
  tooltips.length = 0;
  fills.length = 0;
  act(() => useUiStore.setState({ language: "en" }));
});

/** The tooltip the chart handed to Recharts, rendered for one hovered year. */
function hover(payload: { dataKey: string; value: number | null }[]) {
  const content = tooltips.at(-1)?.content;
  if (!content) throw new Error("no tooltip content");
  return render(
    content({
      active: true,
      label: 2027,
      payload: payload.map((p) => ({ ...p, color: "red" })),
    }),
  ).container;
}

describe("signed bars (net cash flow)", () => {
  const rows = [
    { year: 0, calendarYear: 2026, netCashFlow: null },
    { year: 1, calendarYear: 2027, netCashFlow: 50_000 },
    { year: 2, calendarYear: 2028, netCashFlow: -20_000 },
  ];
  const series = [
    { key: "netCashFlow", name: "Net cash flow", color: SERIES.positive },
  ];

  it("colours each bar by its sign; a gap is green", () => {
    render(
      <ChartCard
        title="Cash"
        kind="czk"
        chart="signed"
        rows={rows}
        series={series}
      />,
    );
    expect(fills.slice(-3)).toEqual([
      SERIES.positive,
      SERIES.positive,
      SERIES.negative,
    ]);
  });

  it("the tooltip names the series and reads a loss in parentheses", () => {
    render(
      <ChartCard
        title="Cash"
        kind="czk"
        chart="signed"
        rows={rows}
        series={series}
      />,
    );
    const text = hover([
      { dataKey: "netCashFlow", value: -20_000 },
    ]).textContent;
    expect(text).toContain("Net cash flow");
    expect(text).toContain("(20 000 Kč)");
  });
});

describe("stacked bars (equity change)", () => {
  it("the tooltip adds the net of the stack under its label", () => {
    render(
      <ChartCard
        title="Equity change"
        kind="czk"
        chart="stacked"
        rows={[{ year: 1, calendarYear: 2027, up: 30_000, down: -10_000 }]}
        series={[
          { key: "up", name: "Appreciation", color: "red" },
          { key: "down", name: "New debt", color: "blue" },
        ]}
        totalLabel="Net change"
      />,
    );
    const text = hover([
      { dataKey: "up", value: 30_000 },
      { dataKey: "down", value: -10_000 },
    ]).textContent;
    expect(text).toContain("Appreciation");
    expect(text).toContain("New debt");
    expect(text).toMatch(/Net change\s*20 000 Kč/);
  });
});
