// @vitest-environment jsdom
//
// ADR 0133 (#129 item 5): with no value, LTV and the yields read "n/a" with no band badge
// — not 0 % in the "Conservative" band.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import {
  applyScenario,
  isoDate,
  money,
  portfolioProjection,
  portfolioSnapshot,
  portfolioSnapshotAtYear,
  propertySnapshot,
  rate,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { projectionSeries } from "../../model/projection";
import { ProjectionGrid } from "../../components/ProjectionGrid";
import { RiskTiles } from "../DashboardPanels";
import { PropertySnapshotTiles } from "../PropertyDetailPanels";
import { Properties } from "../Properties";

vi.mock("../../../lib/today", () => ({
  todayUtc: () => new Date(Date.UTC(2026, 9, 1)),
}));

const NA = en.common.notApplicable;

/** The seed with a 0 Kč valuation for Javorova from baseDate (it still owes 1.6 M Kč). */
const javorovaAtZero: Portfolio = {
  ...portfolio,
  valuations: [
    ...portfolio.valuations,
    {
      id: "v0",
      propertyId: "javorova",
      validFrom: isoDate("2026-06-07"),
      marketValue: money("0"),
    },
  ],
};
const javorova = portfolio.properties.find((p) => p.id === "javorova")!;

const crashed = applyScenario(assumptions, {
  valueShock: { pct: rate("1"), atYear: 0 },
});
const crashedRows = portfolioProjection(portfolio, crashed);

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

/** The tile whose label is `label`. */
function tile(label: string): HTMLElement {
  return screen.getByText(label).closest(".tile") as HTMLElement;
}

describe("Dashboard risk tiles", () => {
  it("LTV and net yield read n/a; no LTV badge; the gross-yield foot says n/a", () => {
    const s = portfolioSnapshotAtYear(
      portfolioSnapshot(portfolio, crashed),
      crashedRows[5]!,
    );
    render(<RiskTiles s={s} cashFlowFoot="" />);
    const ltv = tile(en.dashboard.portfolioLtv);
    expect(within(ltv).getByText(NA)).toBeTruthy();
    expect(ltv.querySelector(".badge")).toBeNull();
    expect(ltv.textContent).not.toContain("0,0 %");
    const yieldTile = tile(en.dashboard.netYieldCap);
    expect(within(yieldTile).getByText(NA)).toBeTruthy();
    expect(
      within(yieldTile).getByText(en.dashboard.grossYieldFoot(NA)),
    ).toBeTruthy();
  });
});

describe("Property detail tiles", () => {
  it("LTV reads n/a with no badge", () => {
    const s = propertySnapshot(javorova, javorovaAtZero, assumptions);
    expect(s.ltv).toBeNull();
    render(<PropertySnapshotTiles s={s} chartRows={[]} modeWord="nominal" />);
    // "Debt" also names a chart series: take the tile that carries the LTV foot.
    const debt = screen
      .getAllByText(en.propertyDetail.debt)
      .map((e) => e.closest(".tile"))
      .find((e) => e?.textContent?.includes(en.propertyDetail.ltv));
    if (!(debt instanceof HTMLElement)) throw new Error("no Debt tile");
    expect(within(debt).getByText(NA)).toBeTruthy();
    expect(debt.querySelector(".badge")).toBeNull();
  });
});

describe("Properties table", () => {
  it("the LTV cell reads n/a with no band word", () => {
    act(() =>
      usePortfolioStore.setState({
        portfolio: javorovaAtZero,
        assumptions,
        status: "ready",
      }),
    );
    act(() => useUiStore.setState({ route: "properties" }));
    render(<Properties />);
    const row = screen
      .getByRole("button", { name: javorova.name })
      .closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell");
    expect(cells.some((c) => c.textContent === NA)).toBe(true);
    expect(row.textContent).not.toContain(en.dashboard.badgeConservative);
  });
});

describe("Projection grid", () => {
  it("a year with debt and no value shows n/a in the LTV column", () => {
    const rows = projectionSeries(crashedRows, "nominal", crashed);
    render(<ProjectionGrid rows={rows} baseDate={crashed.baseDate} />);
    expect(screen.getAllByText(NA).length).toBeGreaterThan(0);
  });
});
