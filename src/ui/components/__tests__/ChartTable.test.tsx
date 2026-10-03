// @vitest-environment jsdom
//
// UX-075 (DR-144): every chart card can show its data as a table — the keyboard and
// screen-reader alternative to the mouse-only tooltips.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChartCard } from "../charts";
import { useUiStore } from "../../../state/uiStore";

beforeAll(() => {
  // Recharts' ResponsiveContainer needs a ResizeObserver; jsdom has none.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

const rows = [
  {
    year: 0,
    calendarYear: 2026,
    value: 5_000_000,
    netCashFlow: null,
    ltv: 0.6,
  },
  {
    year: 1,
    calendarYear: 2027,
    value: 5_200_000,
    netCashFlow: -12_345,
    ltv: 0.55,
  },
];

function Plot() {
  return <svg data-testid="plot" />;
}

function card(kind: "czk" | "pct" = "czk") {
  const series =
    kind === "czk"
      ? [
          { key: "value", name: "Value", color: "red" },
          { key: "netCashFlow", name: "Net cash flow", color: "blue" },
        ]
      : [{ key: "ltv", name: "LTV", color: "red" }];
  return render(
    <ChartCard
      title="Value and cash flow"
      kind={kind}
      rows={rows}
      series={series}
    >
      <Plot />
    </ChartCard>,
  );
}

const cells = (r: HTMLElement) =>
  within(r)
    .getAllByRole("cell")
    .map((c) => c.textContent?.replace(/\s/g, " "));

describe("ChartCard table toggle (UX-075)", () => {
  it("shows the chart first, with an unpressed Table toggle", () => {
    card();
    const toggle = screen.getByRole("button", { name: "Table" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      document.querySelector(".recharts-responsive-container"),
    ).not.toBeNull();
    expect(document.querySelector(".chart-sub")?.textContent).toBe("M Kč");
  });

  it("swaps the chart for a captioned table of the same rows", () => {
    card();
    const toggle = screen.getByRole("button", { name: "Table" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(toggle);
    const chart = () =>
      document.querySelector(".recharts-responsive-container");
    expect(chart()).toBeNull();

    // The table lists whole Kč, so the subtitle names the plain currency.
    expect(document.querySelector(".chart-sub")?.textContent).toBe("Kč");
    const region = screen.getByRole("region", { name: "Value and cash flow" });
    expect(region.tabIndex).toBe(0);
    const table = within(region).getByRole("table", {
      name: "Value and cash flow",
    });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["Year", "Value", "Net cash flow"]);

    const [, first, second] = within(table).getAllByRole("row");
    expect(within(first!).getByRole("rowheader").textContent).toBe("Y0 · 2026");
    expect(cells(first!)).toEqual(["5 000 000", "—"]);
    expect(cells(second!)).toEqual(["5 200 000", "(12 345)"]);
    expect(
      within(second!).getAllByRole("cell")[1]!.querySelector(".tone-negative"),
    ).not.toBeNull();

    fireEvent.click(toggle);
    expect(screen.queryByRole("table")).toBeNull();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(chart()).not.toBeNull();
  });

  it("formats a percent chart's values as percentages", () => {
    card("pct");
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const [, first, second] = screen.getAllByRole("row");
    expect(cells(first!)).toEqual(["60,0 %"]);
    expect(cells(second!)).toEqual(["55,0 %"]);
  });
});
