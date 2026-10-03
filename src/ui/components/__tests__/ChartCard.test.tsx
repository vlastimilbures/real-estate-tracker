// @vitest-environment jsdom
//
// ADR 0114 (#24, #25): a chart surface has a name, the legend and the tooltip show each
// series' colour and dash in a swatch, and tooltip labels are text-coloured.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ChartCard, CzkLines, Tip } from "../charts";
import { seriesTipItems } from "../../model/chartData";
import { useUiStore } from "../../../state/uiStore";

const realRect = HTMLElement.prototype.getBoundingClientRect;
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
  Reflect.deleteProperty(window, "matchMedia");
});
beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

const rows = [
  { year: 0, calendarYear: 2026, s0: 5_000_000, s1: 5_000_000 },
  { year: 1, calendarYear: 2027, s0: 5_200_000, s1: 5_100_000 },
];
const series = [
  { key: "s0", name: "Base", color: "red" },
  { key: "s1", name: "Rates +2pp", color: "blue", dash: "6 3" },
];

function card() {
  return render(
    <ChartCard title="Net worth" kind="czk" rows={rows} series={series}>
      <CzkLines data={rows} series={series} />
    </ChartCard>,
  );
}

describe("chart surface name (#24)", () => {
  it("is a named image that stays a tab stop", () => {
    card();
    const surface = screen.getByRole("img", {
      name: "Net worth — chart. Use the Table button for the values.",
    });
    expect(surface.tagName.toLowerCase()).toBe("svg");
    expect(surface.getAttribute("tabindex")).toBe("0");
  });

  it("is translated", () => {
    act(() => useUiStore.setState({ language: "cs" }));
    card();
    expect(
      screen.getByRole("img", {
        name: "Net worth — graf. Hodnoty zobrazí tlačítko Tabulka.",
      }),
    ).toBeTruthy();
  });
});

describe("series dashes (#25)", () => {
  it("draws a dashed series' line with its dash, the others solid", () => {
    card();
    const curves = [...document.querySelectorAll(".recharts-line-curve")];
    expect(curves).toHaveLength(2);
    expect(curves[0]?.getAttribute("stroke-dasharray")).toBeNull();
    expect(curves[1]?.getAttribute("stroke-dasharray")).toBe("6 3");
  });

  it("names tooltip rows from the series and carries the dash", () => {
    const items = seriesTipItems(
      [
        { dataKey: "s1", value: 5_100_000, color: "blue" },
        { dataKey: "zz", value: null, color: "green" },
      ],
      series,
      "czk",
    );
    expect(items).toEqual([
      {
        label: "Rates +2pp",
        value: 5_100_000,
        color: "blue",
        dash: "6 3",
        kind: "czk",
      },
      {
        label: "zz",
        value: null,
        color: "green",
        dash: undefined,
        kind: "czk",
      },
    ]);
  });
});

describe("series swatches (#25)", () => {
  it("draws the legend swatch with the series dash", () => {
    card();
    const lines = [...document.querySelectorAll(".legend line")];
    expect(lines.map((l) => l.getAttribute("stroke"))).toEqual(["red", "blue"]);
    expect(lines.map((l) => l.getAttribute("stroke-dasharray"))).toEqual([
      null,
      "6 3",
    ]);
  });

  it("gives the tooltip labels the text colour and a hidden swatch", () => {
    render(
      <Tip
        active
        year={2027}
        items={[
          { label: "Base", value: 1, color: "red", kind: "czk" },
          {
            label: "Rates +2pp",
            value: 2,
            color: "blue",
            dash: "2 3",
            kind: "czk",
          },
        ]}
      />,
    );
    const labels = [...document.querySelectorAll(".tt-label")];
    expect(labels.map((l) => l.textContent)).toEqual(["Base", "Rates +2pp"]);
    for (const l of labels) expect((l as HTMLElement).style.color).toBe("");
    const swatches = labels.map((l) => l.querySelector("svg"));
    expect(swatches.map((s) => s?.getAttribute("aria-hidden"))).toEqual([
      "true",
      "true",
    ]);
    expect(
      swatches[1]?.querySelector("line")?.getAttribute("stroke-dasharray"),
    ).toBe("2 3");
  });
});
