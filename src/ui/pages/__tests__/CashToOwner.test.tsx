// @vitest-environment jsdom
//
// ADR 0161 (#117 R8-04): the Dashboard tile is "Cumulative cash to owner", and the
// projection grid shows a "Cash to owner" column right after "Net CF" whose years 1..N
// sum to the tile, in both lenses.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  isoDate,
  money,
  portfolioKpis,
  portfolioProjection,
  portfolioSnapshot,
  type MortgageBlock,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { ZERO } from "../../../lib/money";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { projectionSeries } from "../../model/projection";
import { lensKpis } from "../../model/lensKpis";
import { ProjectionGrid } from "../../components/ProjectionGrid";
import { KpiListPanel } from "../DashboardPanels";

// Probe R8-5: a 1,000,000 Kč prepayment with a 5,000 Kč fee on Byt Lipova.
const prepaid: Portfolio = {
  ...portfolio,
  mortgages: portfolio.mortgages.map((m): MortgageBlock =>
    m.propertyId === "lipova"
      ? {
          ...m,
          prepayments: [
            {
              date: isoDate("2027-01-15"),
              amount: money("1000000"),
              effect: "shortenTerm",
              fee: money("5000"),
            },
          ],
        }
      : m,
  ),
};
const proj = portfolioProjection(prepaid, assumptions);
const kpis = portfolioKpis(prepaid, assumptions);

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Cash to owner (ADR 0161)", () => {
  it.each(["nominal", "real"] as const)(
    "%s: Σ of the grid's Cash to owner over years 1..N is the tile",
    (mode) => {
      const rows = projectionSeries(proj, mode, assumptions);
      const total = rows.slice(1).reduce((s, r) => s.plus(r.cashToOwner), ZERO);
      expect(total.toString()).toBe(
        lensKpis(kpis, mode).cumulativeNetCashFlow.toString(),
      );
    },
  );

  it("the grid shows Cash to owner right after Net CF", () => {
    render(
      <ProjectionGrid
        rows={projectionSeries(proj, "nominal", assumptions)}
        baseDate={assumptions.baseDate}
      />,
    );
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    const netCf = headers.indexOf(en.projGrid.netCf);
    expect(netCf).toBeGreaterThan(0);
    expect(headers[netCf + 1]).toBe("Cash to owner");
    expect(en.projGrid.cashToOwner).toBe("Cash to owner");
  });

  it("the Dashboard tile is named cumulative cash to owner", () => {
    render(
      <KpiListPanel
        s={portfolioSnapshot(prepaid, assumptions)}
        kpis={kpis}
        mode="nominal"
        horizon={kpis.netWorthNominal}
        horizonYears={assumptions.horizonYears}
        irr={{ rate: null, reason: "NOT_UNIQUE" }}
        cashInvested={null}
      />,
    );
    expect(
      screen.getByText("Cumulative cash to owner (Yrs 1–30)"),
    ).toBeTruthy();
    expect(screen.queryByText(/Cumulative net cash flow/)).toBeNull();
  });
});
