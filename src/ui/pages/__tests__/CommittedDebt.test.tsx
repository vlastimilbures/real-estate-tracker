// @vitest-environment jsdom
//
// ADR 0166 (#120), ADR 0169: a development flat under construction shows its drawn debt
// and its value less the tranches not drawn yet; the debt tiles name the undrawn part and
// the value tile the completed value. A portfolio with everything drawn shows no such note.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  portfolioKpis,
  portfolioSnapshot,
  propertySnapshot,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { fmtCzkM } from "../../../lib/format";
import { D } from "../../../lib/money";
import { undrawnPart } from "../../model/debt";
import { HeroTiles } from "../DashboardPanels";
import { PropertySnapshotTiles } from "../PropertyDetailPanels";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

const only = <T extends { propertyId: string }>(rows: T[]) =>
  rows.filter((r) => r.propertyId === "dev");
// The mixed fixture's dev flat: 2.0 M drawn at baseDate, 2.5 M of tranches ahead.
const devOnly: Portfolio = {
  properties: mixed.properties.filter((p) => p.id === "dev"),
  mortgages: only(mixed.mortgages),
  valuations: only(mixed.valuations),
  leases: only(mixed.leases),
  holdingCosts: [],
};
const NOTE = en.common.undrawnDebt(fmtCzkM(D("2500000")));
const COMPLETED = en.common.completedValue(fmtCzkM(D("9500000")));

/** The net-worth tile's text, foot included. */
function heroFoot(): string {
  return screen.getByTestId("kpi-networth").closest(".tile")?.textContent ?? "";
}

function hero(p: Portfolio) {
  const kpis = portfolioKpis(p, assumptions);
  render(
    <HeroTiles
      s={portfolioSnapshot(p, assumptions)}
      mode="nominal"
      isToday
      horizon={kpis.netWorthNominal}
      horizonYears={assumptions.horizonYears}
      horizonEndYear={2056}
      netWorthMultiple={kpis.netWorthMultiple}
      modeWord={en.common.nominalLower}
      irr={{ rate: null, reason: "NO_ROOT" }}
    />,
  );
}

describe("undrawnPart", () => {
  it("is the undrawn amount, null when all is drawn", () => {
    expect(undrawnPart(D("2500000"))?.toString()).toBe("2500000");
    expect(undrawnPart(D("0"))).toBeNull();
  });
});

describe("Dashboard hero foot", () => {
  it("shows the reported value and drawn debt and names the undrawn part", () => {
    hero(devOnly);
    const foot = heroFoot();
    // 9.5 M completed − 2.5 M not drawn yet; 2.0 M drawn.
    expect(foot).toContain(
      en.dashboard.assetsDebtEquity(
        fmtCzkM(D("7000000")),
        fmtCzkM(D("2000000")),
      ),
    );
    expect(foot).toContain(NOTE);
  });

  it("has no undrawn note when every loan is drawn", () => {
    hero(portfolio);
    const foot = heroFoot();
    expect(foot).not.toContain("still to draw");
  });
});

describe("Property detail debt tile", () => {
  const dev = devOnly.properties[0]!;

  it("shows the drawn 2,000,000 and the undrawn part", () => {
    const s = propertySnapshot(dev, devOnly, assumptions);
    render(<PropertySnapshotTiles s={s} chartRows={[]} modeWord="nominal" />);
    const debt = screen
      .getAllByText(en.propertyDetail.debt)
      .map((e) => e.closest(".tile"))
      .find((e) => e?.textContent?.includes(en.propertyDetail.ltv));
    if (!(debt instanceof HTMLElement)) throw new Error("no Debt tile");
    expect(debt.textContent).toMatch(/2\s000\s000/);
    expect(debt.textContent).toContain(NOTE);
  });

  it("shows the value less the undrawn part and names the completed value", () => {
    const s = propertySnapshot(dev, devOnly, assumptions);
    render(<PropertySnapshotTiles s={s} chartRows={[]} modeWord="nominal" />);
    const value = screen
      .getByText(en.propertyDetail.marketValue)
      .closest(".tile");
    if (!(value instanceof HTMLElement)) throw new Error("no Value tile");
    expect(value.textContent).toMatch(/7\s000\s000/);
    expect(value.textContent).toContain(COMPLETED);
  });
});
