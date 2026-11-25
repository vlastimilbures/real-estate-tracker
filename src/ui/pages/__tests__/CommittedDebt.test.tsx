// @vitest-environment jsdom
//
// ADR 0166 (#120), ADR 0169: a development flat under construction shows its drawn debt
// and its value less the tranches not drawn yet; the debt tiles name the undrawn part and
// the value tile the completed value. A portfolio with everything drawn shows no such note.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  portfolioKpis,
  portfolioSnapshot,
  propertySnapshot,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { en } from "../../../i18n/en";
import { fmtCzkM, noBreak } from "../../../lib/format";
import { D } from "../../../lib/money";
import { undrawnPart } from "../../model/debt";
import { KpiStrip } from "../DashboardPanels";
import { stripView } from "./dashboardViewSupport";
import { PropertySnapshotTiles } from "../propertyDetail/PropertySnapshotTiles";

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
// The amount never breaks before its unit, on every screen (ADR 0200, ADR 0205 §3).
const NOTE = en.common.undrawnDebt(noBreak(fmtCzkM(D("2500000"))));
const COMPLETED = en.common.completedValue(fmtCzkM(D("9500000")));

/** The net-worth tile's text, foot included. */
function heroFoot(): string {
  return screen.getByTestId("kpi-networth").closest(".tile")?.textContent ?? "";
}

function hero(p: Portfolio) {
  const kpis = portfolioKpis(p, assumptions);
  render(
    <KpiStrip
      view={stripView({
        s: portfolioSnapshot(p, assumptions),
        basis: { kind: "today" },
        mode: "nominal",
        isToday: true,
        horizon: kpis.netWorthNominal,
        horizonYears: assumptions.horizonYears,
        horizonEndYear: 2056,
        netWorthMultiple: kpis.netWorthMultiple,
        modeWord: en.common.nominalLower,
        irr: { rate: null, reason: "NO_ROOT" },
      })}
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
    // The undrawn note follows the debt it adds to.
    expect(foot).toContain(
      en.dashboard.stripAssetsDebt(
        noBreak(fmtCzkM(D("7000000"))),
        `${noBreak(fmtCzkM(D("2000000")))} (${NOTE})`,
      ),
    );
  });

  it("has no undrawn note when every loan is drawn", () => {
    hero(portfolio);
    const foot = heroFoot();
    expect(foot).not.toContain("to draw");
  });
});

/** A Property detail tile by its label (ADR 0215: one strip of six). */
function stripTile(label: string): HTMLElement {
  const tile = [
    ...document.querySelectorAll<HTMLElement>(".kpi-band .tile"),
  ].find((e) => e.querySelector(".label")?.textContent === label);
  if (!tile) throw new Error(`no ${label} tile`);
  return tile;
}

// ADR 0215: the undrawn note is the Debt tile's foot.
describe("Property detail debt tile", () => {
  const dev = devOnly.properties[0]!;

  it("shows the drawn 2,000,000 and the undrawn part", () => {
    const s = propertySnapshot(dev, devOnly, assumptions);
    render(
      <PropertySnapshotTiles
        s={s}
        chartRows={[]}
        modeWord="nominal"
        basis={{ kind: "today" }}
      />,
    );
    const debt = stripTile(en.propertyDetail.debt);
    expect(debt.textContent).toMatch(/2\s000\s000/);
    expect(debt.textContent).toContain(NOTE);
  });

  it("shows the value less the undrawn part and names the completed value", () => {
    const s = propertySnapshot(dev, devOnly, assumptions);
    render(
      <PropertySnapshotTiles
        s={s}
        chartRows={[]}
        modeWord="nominal"
        basis={{ kind: "today" }}
      />,
    );
    const value = screen
      .getByText(en.propertyDetail.marketValue)
      .closest(".tile");
    if (!(value instanceof HTMLElement)) throw new Error("no Value tile");
    expect(value.textContent).toMatch(/7\s000\s000/);
    expect(value.textContent).toContain(COMPLETED);
  });
});
