// @vitest-environment jsdom
//
// ADR 0088 (#13): at a future as-of date no Dashboard tile or hint says "today" or
// "current", and the horizon tile names its end year whatever the as-of date.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  addYears,
  portfolioKpis,
  portfolioProjection,
  portfolioSnapshot,
} from "../../../engine";
import type { IsoDate } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { projectionSeries } from "../../model/projection";
import {
  asOfBasis,
  horizonEndYear,
  monthlyFlow,
  monthlyFlowLabels,
  netCashFlowFoot,
  tilesForAsOf,
} from "../../model/dashboard";
import { HeroTiles, MonthlyFlowPanel, RiskTiles } from "../DashboardPanels";

const kpis = portfolioKpis(portfolio, assumptions);
const series = projectionSeries(
  portfolioProjection(portfolio, assumptions),
  "nominal",
  assumptions,
);
const base = assumptions.baseDate;

function renderAt(asOf: IsoDate, isToday: boolean) {
  const snapshot = portfolioSnapshot(portfolio, assumptions, asOf);
  const s = tilesForAsOf(snapshot, series, "nominal", assumptions);
  const basis = asOfBasis(base, asOf, series, isToday);
  const labels = monthlyFlowLabels(en, basis, base, asOf);
  return render(
    <>
      <HeroTiles
        s={s}
        mode="nominal"
        isToday={isToday}
        horizon={kpis.netWorthNominal}
        horizonYears={assumptions.horizonYears}
        horizonEndYear={horizonEndYear(series)}
        netWorthMultiple={kpis.netWorthMultiple}
        modeWord={en.common.nominalLower}
        irr={{ rate: null, reason: "NO_ROOT" }}
      />
      <RiskTiles s={s} cashFlowFoot={netCashFlowFoot(en, basis)} />
      <MonthlyFlowPanel
        flow={monthlyFlow(s)}
        title={labels.title}
        hint={labels.hint}
      />
    </>,
  );
}

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Dashboard as-of labels (ADR 0088)", () => {
  const endYear = horizonEndYear(series);
  const horizonLabel = en.dashboard.netWorthInYear(
    endYear,
    assumptions.horizonYears,
  );

  it("+5y: no tile or hint says today or current", () => {
    const { container } = renderAt(addYears(base, 5), false);
    expect(container.textContent).not.toMatch(/today|current/i);
    expect(
      screen.getByText(/^Monthly equivalent — projection year Y5/),
    ).toBeTruthy();
    expect(screen.getByText(horizonLabel)).toBeTruthy();
  });

  it("today: current wording and the run-rate hint", () => {
    renderAt(base, true);
    expect(screen.getByText(en.dashboard.currentMonthlyCashFlow)).toBeTruthy();
    expect(screen.getByText(/^annualised run rate ÷ 12/)).toBeTruthy();
    expect(screen.getByText(en.dashboard.noiMinusDebtService)).toBeTruthy();
    expect(screen.getByText(horizonLabel)).toBeTruthy();
  });

  it("the horizon label names the last projection year", () => {
    expect(endYear).toBe(base.getUTCFullYear() + assumptions.horizonYears);
  });
});
