// @vitest-environment jsdom
//
// ADR 0166 (#120): a development flat under construction shows its committed debt (drawn
// + tranches not drawn yet), and the debt tiles name the undrawn part. A portfolio with
// everything drawn shows no such note.
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
  it("is the committed debt above the drawn debt, null when all is drawn", () => {
    expect(undrawnPart(D("4500000"), D("2000000"))?.toString()).toBe("2500000");
    expect(undrawnPart(D("2000000"), D("2000000"))).toBeNull();
  });
});

describe("Dashboard hero foot", () => {
  it("shows committed debt and names the undrawn part", () => {
    hero(devOnly);
    const foot = heroFoot();
    expect(foot).toContain(
      en.dashboard.assetsDebtEquity(
        fmtCzkM(D("9500000")),
        fmtCzkM(D("4500000")),
      ),
    );
    expect(foot).toContain(NOTE);
  });

  it("has no undrawn note when every loan is drawn", () => {
    hero(portfolio);
    const foot = heroFoot();
    expect(foot).not.toContain("not drawn yet");
  });
});

describe("Property detail debt tile", () => {
  const dev = devOnly.properties[0]!;

  it("shows the committed 4,500,000 and the undrawn part", () => {
    const s = propertySnapshot(dev, devOnly, assumptions);
    render(<PropertySnapshotTiles s={s} chartRows={[]} modeWord="nominal" />);
    const debt = screen
      .getAllByText(en.propertyDetail.debt)
      .map((e) => e.closest(".tile"))
      .find((e) => e?.textContent?.includes(en.propertyDetail.ltv));
    if (!(debt instanceof HTMLElement)) throw new Error("no Debt tile");
    expect(debt.textContent).toMatch(/4\s500\s000/);
    expect(debt.textContent).toContain(NOTE);
  });
});
