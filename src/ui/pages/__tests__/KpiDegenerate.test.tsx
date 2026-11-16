// @vitest-environment jsdom
//
// ADR 0126 (#129): no debt shows no DSCR badge (not "Shortfall"), and a multiple with no
// growth base (null) shows "—" on the hero foot and in the KPI list.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import {
  isoDate,
  portfolioKpis,
  portfolioSnapshot,
  propertySnapshot,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { KpiStrip, KpiListPanel } from "../DashboardPanels";
import { renderStrip } from "./kpiStripSupport";
import { PropertySnapshotTiles } from "../PropertyDetailPanels";

const debtFree: Portfolio = { ...portfolio, mortgages: [] };
const N = assumptions.horizonYears;

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

/** The tile whose label is `label`. */
function tile(label: string): HTMLElement {
  return screen.getByText(label).closest(".tile") as HTMLElement;
}

describe("no debt: no DSCR badge (ADR 0126)", () => {
  it("Dashboard DSCR tile shows — and no Shortfall badge", () => {
    const s = portfolioSnapshot(debtFree, assumptions);
    expect(s.dscr).toBeNull();
    renderStrip(s);
    const dscr = tile(en.dashboard.portfolioDscr);
    expect(within(dscr).getByText("—")).toBeTruthy();
    expect(dscr.textContent).not.toContain(en.dashboard.badgeShortfall);
    expect(dscr.querySelector(".badge")).toBeNull();
    expect(dscr.querySelector(".health-marker")).toBeNull();
  });

  it("Property detail DSCR tile shows — and no badge", () => {
    const p = debtFree.properties[0];
    const s = propertySnapshot(p, debtFree, assumptions);
    expect(s.dscr).toBeNull();
    render(
      <PropertySnapshotTiles
        s={s}
        chartRows={[]}
        modeWord="nominal"
        basis={{ kind: "today" }}
      />,
    );
    const dscr = tile(en.propertyDetail.dscr);
    expect(dscr.textContent).not.toContain("Short");
    expect(dscr.querySelector(".badge")).toBeNull();
    expect(dscr.querySelector(".health-marker")).toBeNull();
  });
});

describe("no growth base: the multiple shows — (ADR 0126)", () => {
  const later: Portfolio = {
    ...portfolio,
    properties: portfolio.properties.map((p) => ({
      ...p,
      purchaseDate: isoDate("2028-01-15"),
    })),
    mortgages: [],
  };
  const kpis = portfolioKpis(later, assumptions);
  const s = portfolioSnapshot(later, assumptions);

  it("hero foot and KPI list", () => {
    expect(kpis.netWorthMultiple).toBeNull();
    render(
      <>
        <KpiStrip
          s={s}
          basis={{ kind: "today" }}
          mode="nominal"
          isToday
          horizon={kpis.netWorthNominal}
          horizonYears={N}
          horizonEndYear={2056}
          netWorthMultiple={kpis.netWorthMultiple}
          modeWord={en.common.nominalLower}
          irr={{ rate: null, reason: "NO_ROOT" }}
        />
        <KpiListPanel
          s={s}
          basis={{ kind: "today" }}
          kpis={kpis}
          mode="nominal"
          horizonYears={N}
          cashInvested={null}
        />
      </>,
    );
    expect(screen.getByText(en.dashboard.bandMultiple("—"))).toBeTruthy();
    // The multiple is the tile's alone (ADR 0208 §1).
    expect(screen.queryByText("Net-worth multiple")).toBeNull();
  });
});
