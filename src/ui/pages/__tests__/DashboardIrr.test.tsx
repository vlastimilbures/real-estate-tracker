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
import { KpiStrip, KpiListPanel } from "../DashboardPanels";
import type { LeveredIrr } from "../../model/irr";

const s = portfolioSnapshot(portfolio, assumptions);
const kpis = portfolioKpis(portfolio, assumptions);
const notUnique: LeveredIrr = { rate: null, reason: "NOT_UNIQUE" };

function renderPanels(irr: LeveredIrr) {
  return render(
    <>
      <KpiStrip
        s={s}
        basis={{ kind: "today" }}
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
        basis={{ kind: "today" }}
        kpis={kpis}
        mode="nominal"
        horizonYears={assumptions.horizonYears}
        cashInvested={null}
      />
    </>,
  );
}

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Dashboard levered IRR (UX-079)", () => {
  // The list no longer repeats the tile (ADR 0208 §1).
  it("shows n/a with the reason in the tile, not again in the KPI list", () => {
    renderPanels(notUnique);
    const cells = screen.getAllByTitle(en.common.irrNotUnique);
    expect(cells).toHaveLength(1);
    for (const c of cells) {
      expect(c.textContent).toBe(
        `${en.common.notApplicable} (${en.common.irrNotUnique})`,
      );
    }
  });

  it("shows the rate when there is one", () => {
    renderPanels({ rate: D("0.0615"), reason: null });
    // The tile rounds; its tooltip has the two decimals the list used to show.
    expect(screen.getByText("6,2 %")).toBeTruthy();
    expect(screen.queryByText("6,15 %")).toBeNull();
    expect(screen.getByTitle("6,15 %")).toBeTruthy();
    expect(screen.queryByTitle(en.common.irrNotUnique)).toBeNull();
  });
});
