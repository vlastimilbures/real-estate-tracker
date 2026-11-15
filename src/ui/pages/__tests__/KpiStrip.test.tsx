// @vitest-environment jsdom
//
// ADR 0200 (#375): one strip of six compact tiles replaces the two tile rows and the
// monthly cash-flow panel; the figures that leave the tiles move to the KPI list, so none
// leaves the page, and the basis is named once for the strip.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import {
  addYears,
  money,
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
  asOfView,
  basisText,
  horizonEndYear,
  monthlyFlow,
  tilesForAsOf,
} from "../../model/dashboard";
import {
  fmtCzk,
  fmtCzkM,
  fmtMultiple,
  fmtPct,
  noBreak,
} from "../../../lib/format";
import { ltvBandWord } from "../../model/health";
import { KpiListPanel, KpiStrip } from "../DashboardPanels";

const kpis = portfolioKpis(portfolio, assumptions);
const series = projectionSeries(
  portfolioProjection(portfolio, assumptions),
  "nominal",
  assumptions,
);
const base = assumptions.baseDate;
const d = en.dashboard;
const endYear = horizonEndYear(series);

function setUp(asOf: IsoDate, isToday: boolean) {
  const snapshot = portfolioSnapshot(portfolio, assumptions, asOf);
  const basis = asOfView(base, asOf, isToday);
  const s = tilesForAsOf(snapshot, series, basis, "nominal", assumptions);
  const props = {
    s,
    basis,
    mode: "nominal" as const,
    isToday,
    horizon: kpis.netWorthNominal,
    horizonYears: assumptions.horizonYears,
    horizonEndYear: endYear,
    netWorthMultiple: kpis.netWorthMultiple,
    modeWord: en.common.nominalLower,
    irr: { rate: null, reason: "NO_ROOT" as const },
  };
  return { s, basis, props };
}

function renderStrip(
  asOf: IsoDate,
  isToday: boolean,
  patch: Partial<ReturnType<typeof setUp>["s"]> = {},
) {
  const { s: base0, basis, props } = setUp(asOf, isToday);
  const s = { ...base0, ...patch };
  const view = render(<KpiStrip {...props} s={s} />);
  const tiles = Array.from(
    view.container.querySelectorAll<HTMLElement>(".kpi-strip > .tile"),
  );
  return { s, basis, tiles };
}

const part = (tile: HTMLElement, cls: string) =>
  tile.querySelector<HTMLElement>(`:scope > .${cls}`)!;

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("KPI strip (ADR 0200 §1)", () => {
  it("is one strip of six compact tiles, in order", () => {
    const { tiles } = renderStrip(base, true);
    expect(tiles.map((t) => part(t, "label").textContent)).toEqual([
      d.netWorth,
      d.stripInYear(endYear),
      d.leveredIrr,
      d.portfolioLtv,
      d.portfolioDscr,
      d.stripNetCashFlow,
    ]);
    for (const t of tiles) expect(t.classList.contains("compact")).toBe(true);
  });

  it("each tile reads label, value, foot in that order", () => {
    const { tiles } = renderStrip(base, true);
    for (const t of tiles) {
      const kids = Array.from(t.children).map((c) => c.className.split(" ")[0]);
      expect(kids).toEqual(["label", "value", "foot"]);
    }
  });

  it("net worth in M Kč; the exact amount is its tooltip and is read out", () => {
    const { s, tiles } = renderStrip(base, true);
    const value = screen.getByTestId("kpi-networth");
    const num = value.querySelector<HTMLElement>("[title]")!;
    expect(num.getAttribute("title")).toBe(fmtCzk(s.totalEquity));
    // Seen: the M Kč figure; heard as well: the exact amount (as IrrValue's reason).
    expect(num.firstChild?.textContent).toBe(fmtCzkM(s.totalEquity));
    expect(num.querySelector(".sr-only")?.textContent).toBe(
      ` (${fmtCzk(s.totalEquity)})`,
    );
    expect(num.classList.contains("tone-negative")).toBe(false);
    expect(part(tiles[0]!, "foot").textContent).toBe(
      d.stripAssetsDebt(
        noBreak(fmtCzkM(s.totalReportedValue)),
        noBreak(fmtCzkM(s.totalDebt)),
      ),
    );
  });

  it("a negative net worth is red (CLAUDE.md §5)", () => {
    renderStrip(base, true, { totalEquity: money(-500000) });
    const num = screen
      .getByTestId("kpi-networth")
      .querySelector<HTMLElement>("[title]")!;
    expect(num.firstChild?.textContent).toBe(fmtCzkM(money(-500000)));
    expect(num.classList.contains("tone-negative")).toBe(true);
  });

  it("real lens away from today: the foot says the amounts are in base-date Kč", () => {
    const { props } = setUp(addYears(base, 5), false);
    const view = render(
      <KpiStrip {...props} mode="real" modeWord={en.common.realLower} />,
    );
    const foot = view.container.querySelector(".kpi-strip > .tile > .foot")!;
    expect(foot.textContent!.endsWith(d.realTodayKc)).toBe(true);
  });

  it("the horizon tile: M Kč, multiple · horizon · lens in the foot", () => {
    const { tiles } = renderStrip(base, true);
    expect(part(tiles[1]!, "value").textContent).toBe(
      fmtCzkM(kpis.netWorthNominal),
    );
    expect(part(tiles[1]!, "foot").textContent).toBe(
      d.stripHorizonFoot(
        fmtMultiple(kpis.netWorthMultiple!),
        assumptions.horizonYears,
        en.common.nominalLower,
      ),
    );
  });

  it("LTV: the figure, then only the marker and band word", () => {
    const { s, tiles } = renderStrip(base, true);
    expect(part(tiles[3]!, "value").textContent).toBe(fmtPct(s.ltv!, 1));
    const foot = part(tiles[3]!, "foot");
    expect(foot.querySelector(".health-marker")).not.toBeNull();
    expect(foot.textContent).toBe(ltvBandWord(en, s.ltv));
  });

  it("net cash flow per month, the year and the basis in the foot", () => {
    const { s, tiles } = renderStrip(base, true);
    const flow = monthlyFlow(s);
    expect(part(tiles[5]!, "value").textContent).toBe(
      fmtCzk(flow.net, { parens: true }) + d.perMonth,
    );
    const foot = part(tiles[5]!, "foot");
    expect(foot.textContent).toBe(
      fmtCzk(s.netCashFlow, { parens: true }) + d.perYearBasis(d.basisCurrent),
    );
  });

  it("a negative year in the foot is red, like the month above it", () => {
    const { tiles } = renderStrip(base, true, { netCashFlow: money(-37080) });
    const amount = part(tiles[5]!, "foot").querySelector(".num")!;
    expect(amount.textContent).toBe(fmtCzk(money(-37080), { parens: true }));
    expect(amount.classList.contains("tone-negative")).toBe(true);
  });
});

describe("KPI strip basis (ADR 0200 §2)", () => {
  it("names it once, in the net cash flow foot; +5y names the projection year", () => {
    const { basis, tiles, s } = renderStrip(addYears(base, 5), false);
    const text = basisText(en, basis);
    expect(text).toBe(d.basisProjection(`Y5 · ${base.getUTCFullYear() + 5}`));
    expect(part(tiles[5]!, "foot").textContent).toBe(
      fmtCzk(s.netCashFlow, { parens: true }) + d.perYearBasis(text),
    );
    const strip = tiles[0]!.parentElement!;
    expect(strip.textContent!.split(text).length - 1).toBe(1);
    expect(strip.textContent).not.toMatch(/today|current/i);
  });

  it("a date that is no projection year is named as that date", () => {
    expect(basisText(en, { kind: "snapshot", date: base })).toBe(
      d.basisOn("07.06.2026"),
    );
    expect(basisText(en, { kind: "today" })).toBe(d.basisCurrent);
  });
});

describe("KPI list takes the figures that left the tiles (ADR 0200 §3)", () => {
  it("net yield, gross yield, monthly inflow and outflow, under the basis", () => {
    const { s, basis } = setUp(base, true);
    render(
      <KpiListPanel
        s={s}
        basis={basis}
        kpis={kpis}
        mode="nominal"
        horizon={kpis.netWorthNominal}
        horizonYears={assumptions.horizonYears}
        irr={{ rate: null, reason: "NO_ROOT" }}
        cashInvested={null}
      />,
    );
    const group = screen.getByRole("heading", {
      name: d.kpiAsOfGroup(d.basisCurrent),
    });
    const list = group.nextElementSibling as HTMLElement;
    const flow = monthlyFlow(s);
    const row = (k: string) =>
      within(list).getByText(k).nextElementSibling?.textContent;
    expect(row(d.netYieldCap)).toBe(fmtPct(s.netYield!, 2));
    expect(row(d.kpiGrossYield)).toBe(fmtPct(s.grossYield!, 2));
    expect(row(d.kpiMonthlyInflow)).toBe(fmtCzk(flow.inflow));
    expect(row(d.kpiMonthlyOutflow)).toBe(fmtCzk(flow.outflow));
    // How the monthly figures are made, as the monthly panel said (ADR 0088 §3).
    expect(list.nextElementSibling?.textContent).toBe(
      d.monthlyHint("07.06.2026"),
    );
  });

  it("at +5y the group names the projection year and the figures are the year ÷ 12", () => {
    const asOf = addYears(base, 5);
    const { s, basis } = setUp(asOf, false);
    render(
      <KpiListPanel
        s={s}
        basis={basis}
        kpis={kpis}
        mode="nominal"
        horizon={kpis.netWorthNominal}
        horizonYears={assumptions.horizonYears}
        irr={{ rate: null, reason: "NO_ROOT" }}
        cashInvested={null}
      />,
    );
    const group = screen.getByRole("heading", {
      name: d.kpiAsOfGroup(basisText(en, basis)),
    });
    expect(group.textContent).not.toContain(d.basisCurrent);
    expect(group.nextElementSibling?.nextElementSibling?.textContent).toBe(
      d.monthlyHintProjection,
    );
  });
});
