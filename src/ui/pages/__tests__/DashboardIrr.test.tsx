// @vitest-environment jsdom
//
// UX-079 (DR-158, ADR 0079): the Dashboard's IRR tile and KPI list show "n/a" and the
// reason when the levered IRR has no value, and the rate when it has one.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { D } from "../../../lib/money";
import { portfolioKpis, portfolioSnapshot } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { HeroTiles, KpiListPanel } from "../DashboardPanels";
import type { LeveredIrr } from "../../model/irr";

const s = portfolioSnapshot(portfolio, assumptions);
const kpis = portfolioKpis(portfolio, assumptions);
const notUnique: LeveredIrr = { rate: null, reason: "NOT_UNIQUE" };

function renderPanels(irr: LeveredIrr) {
  return render(
    <>
      <HeroTiles
        s={s}
        mode="nominal"
        isToday
        horizon={kpis.netWorthNominal}
        horizonYears={assumptions.horizonYears}
        horizonEndYear={2056}
        netWorthMultiple={kpis.netWorthMultiple}
        modeWord={en.common.nominalLower}
        irr={irr}
      />
      <KpiListPanel
        s={s}
        kpis={kpis}
        mode="nominal"
        horizon={kpis.netWorthNominal}
        horizonYears={assumptions.horizonYears}
        irr={irr}
      />
    </>,
  );
}

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Dashboard levered IRR (UX-079)", () => {
  it("shows n/a with the reason in the tile and the KPI list", () => {
    renderPanels(notUnique);
    const cells = screen.getAllByTitle(en.common.irrNotUnique);
    expect(cells).toHaveLength(2);
    for (const c of cells) {
      expect(c.textContent).toBe(
        `${en.common.notApplicable} (${en.common.irrNotUnique})`,
      );
    }
  });

  it("shows the rate when there is one", () => {
    renderPanels({ rate: D("0.0615"), reason: null });
    expect(screen.getByText("6,2 %")).toBeTruthy();
    expect(screen.getByText("6,15 %")).toBeTruthy();
    expect(screen.queryByTitle(en.common.irrNotUnique)).toBeNull();
  });
});
