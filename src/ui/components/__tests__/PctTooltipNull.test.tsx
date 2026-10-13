// @vitest-environment jsdom
//
// ADR 0133: an LTV with no value is a gap in the line. Recharts drops null entries from
// the tooltip payload by default (`filterNull`), so the series would vanish from the
// hover instead of reading "n/a". The percent charts keep them.
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
import { useUiStore } from "../../../state/uiStore";

type TooltipProps = {
  filterNull?: boolean;
  content?: (p: {
    active: boolean;
    label: number;
    payload: { dataKey: string; value: number | null; color: string }[];
  }) => ReactElement;
};
const seen: TooltipProps[] = [];

vi.mock("recharts", async (importOriginal) => {
  const real = await importOriginal<typeof import("recharts")>();
  return {
    ...real,
    Tooltip: (props: TooltipProps) => {
      seen.push(props);
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
  seen.length = 0;
  act(() => useUiStore.setState({ language: "en" }));
});

const rows = [
  { year: 0, calendarYear: 2026, ltv: null, s0: 0.33, s1: null },
  { year: 1, calendarYear: 2027, ltv: null, s0: 0.31, s1: null },
];

/** Renders the tooltip content the chart handed to Recharts for a hovered gap. */
function hoverText(p: TooltipProps, dataKey: string): string {
  const el = p.content?.({
    active: true,
    label: 2027,
    payload: [{ dataKey, value: null, color: "red" }],
  });
  if (!el) throw new Error("no tooltip content");
  return render(el).container.textContent ?? "";
}

describe("percent chart tooltips keep a null LTV", () => {
  it("several series (scenario compare)", () => {
    render(
      <ChartCard
        title="LTV"
        kind="pct"
        rows={rows}
        series={[
          { key: "s0", name: "Base", color: "red" },
          { key: "s1", name: "Crash", color: "blue" },
        ]}
      />,
    );
    const p = seen.at(-1)!;
    expect(p.filterNull).toBe(false);
    expect(hoverText(p, "s1")).toContain("Crash");
    expect(hoverText(p, "s1")).toContain("n/a");
  });

  it("one series (Dashboard LTV)", () => {
    render(
      <ChartCard
        title="LTV"
        kind="pct"
        rows={rows}
        series={[{ key: "ltv", name: "LTV", color: "red" }]}
      />,
    );
    const p = seen.at(-1)!;
    expect(p.filterNull).toBe(false);
    expect(hoverText(p, "ltv")).toContain("n/a");
  });
});
