// @vitest-environment jsdom
//
// ADR 0210 (#382): upcoming fixation ends as markers on a value chart: a dashed line with
// a diamond per marked year, a legend entry, and the year's resets in its tooltip.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ChartCard, Tip } from "../charts";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { D } from "../../../lib/money";
import { fmtCzk } from "../../../lib/format";
import type { ResetMarker } from "../../model/financing";

const realRect = HTMLElement.prototype.getBoundingClientRect;
const realMatchMedia = window.matchMedia;
beforeAll(() => {
  // Recharts' ResponsiveContainer needs a ResizeObserver and a measured box; jsdom has
  // neither, so the chart would not render at all.
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
  // Reduce motion: no entry animation, so a line's dash is its final pattern.
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
beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

const rows = [2026, 2027, 2028, 2029].map((calendarYear, year) => ({
  year,
  calendarYear,
  value: 5_000_000 + year * 100_000,
}));
const series = [{ key: "value", name: "Value", color: "red" }];
const markers: ResetMarker[] = [
  {
    calendarYear: 2028,
    resets: [
      { name: "Byt Lipova", date: "15.01.2028", balance: D("4772578") },
      { name: "Byt Dubova", date: "12.03.2028", balance: D("2027757") },
    ],
  },
];

describe("reset markers on a chart (ADR 0210)", () => {
  it("draws one marker line per marked year and names it in the legend", () => {
    const { container } = render(
      <ChartCard
        title="Value"
        kind="czk"
        rows={rows}
        series={series}
        markers={markers}
        markerHeading={en.charts.rateReset}
      />,
    );
    expect(
      container.querySelectorAll(".recharts-reference-line.reset-marker"),
    ).toHaveLength(1);
    expect(container.querySelector(".legend")?.textContent).toContain(
      en.charts.rateReset,
    );
  });

  it("no marker, no legend entry", () => {
    const { container } = render(
      <ChartCard
        title="Value"
        kind="czk"
        rows={rows}
        series={series}
        markers={[]}
        markerHeading={en.charts.rateReset}
      />,
    );
    expect(container.querySelector(".reset-marker")).toBeNull();
    expect(screen.queryByText(en.charts.rateReset)).toBeNull();
  });

  it("the year's tooltip lists its resets: property, date, debt at reset", () => {
    render(
      <Tip
        active
        year={2028}
        items={[]}
        resets={{ heading: en.charts.rateReset, items: markers[0]!.resets }}
      />,
    );
    expect(screen.getByText(en.charts.rateReset)).toBeTruthy();
    const rowsShown = [...document.querySelectorAll(".tt-reset")].map(
      (r) => r.textContent,
    );
    expect(rowsShown).toEqual([
      `Byt Lipova · 15.01.2028${fmtCzk(D("4772578"))}`,
      `Byt Dubova · 12.03.2028${fmtCzk(D("2027757"))}`,
    ]);
  });
});
