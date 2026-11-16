// @vitest-environment jsdom
//
// ADR 0200 (#375), ADR 0222 (#421): one band of six cells in two captioned groups, as of
// and at the horizon; the figures that left the tiles are in the KPI list, so none
// leaves the page, and the basis and the horizon are each named once, in a caption.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import {
  addYears,
  money,
  rate,
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
    view.container.querySelectorAll<HTMLElement>(".kpi-band .tile"),
  );
  return { s, basis, tiles, view };
}

const part = (tile: HTMLElement, cls: string) =>
  tile.querySelector<HTMLElement>(`:scope > .${cls}`)!;

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

/** The band's groups: each a group named by its caption, with its cells' labels. */
function groupsOf(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(".kpi-band > [role=group]"),
    (g) => ({
      el: g,
      caption: g.querySelector(".kpi-band-caption")?.textContent,
      labelledBy: g.getAttribute("aria-labelledby"),
      labels: Array.from(
        g.querySelectorAll(".tile > .label"),
        (l) => l.textContent,
      ),
    }),
  );
}

describe("KPI band (ADR 0222 §1–§2)", () => {
  it("is one band of six cells in two captioned groups: as of, then the horizon", () => {
    const { view, tiles } = renderStrip(base, true);
    const groups = groupsOf(view.container);
    expect(groups.map((g) => g.caption)).toEqual([
      "Current",
      d.bandHorizonCaption(endYear, assumptions.horizonYears, "nominal"),
    ]);
    expect(groups.map((g) => g.labels)).toEqual([
      [d.netWorth, d.stripNetCashFlow, d.portfolioLtv, d.portfolioDscr],
      [d.netWorth, d.leveredIrr],
    ]);
    // Each group is named by its caption.
    for (const g of groups) {
      const caption = g.el.querySelector(".kpi-band-caption")!;
      expect(g.labelledBy).toBe(caption.id);
    }
    expect(view.container.querySelectorAll(".kpi-band")).toHaveLength(1);
    expect(tiles).toHaveLength(6);
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
    const foot = view.container.querySelector(".kpi-band .tile > .foot")!;
    expect(foot.textContent!.endsWith(d.realTodayKc)).toBe(true);
  });

  it("the horizon net worth: M Kč, the multiple in the foot; IRR's foot says after debt", () => {
    const { tiles } = renderStrip(base, true);
    // The exact amount is read out after it, as on the net worth tile (ADR 0208 §1).
    expect(part(tiles[4]!, "value").textContent).toBe(
      `${fmtCzkM(kpis.netWorthNominal)} (${fmtCzk(kpis.netWorthNominal)})`,
    );
    expect(part(tiles[4]!, "foot").textContent).toBe(
      d.bandMultiple(fmtMultiple(kpis.netWorthMultiple!)),
    );
    expect(part(tiles[5]!, "foot").textContent).toBe(d.bandIrrFoot);
  });

  it("LTV: the figure, then only the marker and band word", () => {
    const { s, tiles } = renderStrip(base, true);
    expect(part(tiles[2]!, "value").textContent).toBe(fmtPct(s.ltv!, 1));
    const foot = part(tiles[2]!, "foot");
    expect(foot.querySelector(".health-marker")).not.toBeNull();
    expect(foot.textContent).toBe(ltvBandWord(en, s.ltv));
  });

  it("net cash flow per month, the year in the foot", () => {
    const { s, tiles } = renderStrip(base, true);
    const flow = monthlyFlow(s);
    expect(part(tiles[1]!, "value").textContent).toBe(
      fmtCzk(flow.net, { parens: true }) + d.perMonth,
    );
    const foot = part(tiles[1]!, "foot");
    expect(foot.textContent).toBe(
      fmtCzk(s.netCashFlow, { parens: true }) + d.perYear,
    );
  });

  it("a negative year in the foot is red, like the month above it", () => {
    const { tiles } = renderStrip(base, true, { netCashFlow: money(-37080) });
    const amount = part(tiles[1]!, "foot").querySelector(".num")!;
    expect(amount.textContent).toBe(fmtCzk(money(-37080), { parens: true }));
    expect(amount.classList.contains("tone-negative")).toBe(true);
  });
});

describe("KPI band basis (ADR 0222 §2)", () => {
  it("names it once, in the as-of group's caption; +5y names the projection year", () => {
    const { basis, view } = renderStrip(addYears(base, 5), false);
    const text = basisText(en, basis);
    expect(text).toBe(d.basisProjection(`Y5 · ${base.getUTCFullYear() + 5}`));
    const caption = `P${text.slice(1)}`;
    expect(groupsOf(view.container)[0]!.caption).toBe(caption);
    const band = view.container.querySelector(".kpi-band")!;
    expect(band.textContent!.split(caption).length - 1).toBe(1);
    expect(band.textContent).not.toMatch(/today|current/i);
  });

  it("a date that is no projection year is named as that date", () => {
    expect(basisText(en, { kind: "snapshot", date: base })).toBe(
      d.basisOn("07.06.2026"),
    );
    expect(basisText(en, { kind: "today" })).toBe(d.basisCurrent);
  });
});

// ADR 0208 (#383): the list shows only what the tiles do not, in three groups.
function renderList(
  asOf: IsoDate,
  isToday: boolean,
  cashInvested = null as ReturnType<typeof money> | null,
) {
  const { s, basis } = setUp(asOf, isToday);
  const view = render(
    <KpiListPanel
      s={s}
      basis={basis}
      kpis={kpis}
      mode="nominal"
      horizonYears={assumptions.horizonYears}
      cashInvested={cashInvested}
    />,
  );
  const group = (name: string) => {
    const h = screen.getByRole("heading", { level: 3, name });
    return h.closest(".kpi-group") as HTMLElement;
  };
  const labels = (g: HTMLElement) =>
    Array.from(g.querySelectorAll(".statlist .k"), (k) => k.textContent);
  return { s, basis, view, group, labels };
}

describe("Key figures: only what the tiles do not show, in three groups (ADR 0208)", () => {
  it("Returns, Cash flow and Debt, each a heading over its rows, in that order", () => {
    const { group, labels, view } = renderList(base, true);
    const N = assumptions.horizonYears;
    expect(
      Array.from(
        view.container.querySelectorAll(".kpi-group h3"),
        (h) => h.textContent,
      ),
    ).toEqual([d.kpiGroupReturns, d.kpiGroupCashFlow, d.kpiGroupDebt]);
    expect(labels(group(d.kpiGroupReturns))).toEqual([
      d.kpiNetWorthCagr,
      d.netYieldCap,
      d.kpiGrossYield,
    ]);
    expect(labels(group(d.kpiGroupCashFlow))).toEqual([
      d.kpiMonthlyInflow,
      d.kpiMonthlyOutflow,
      d.kpiCumulativeCashToOwner(N),
      d.kpiFirstCfPositiveYear,
    ]);
    expect(labels(group(d.kpiGroupDebt))).toEqual([
      d.kpiWeightedAvgRate,
      d.kpiSumPrincipalRepaid(N),
      d.kpiDebtFullyRepaid,
    ]);
  });

  it("repeats no tile: net worth at the horizon, the multiple and IRR are not listed", () => {
    const { view } = renderList(base, true);
    // The labels the list used for them (their dictionary keys are gone) …
    for (const k of [
      "Net worth at horizon",
      "Net-worth multiple",
      "Levered IRR",
    ])
      expect(view.container.textContent).not.toContain(k);
    // … and their values: no list value is the horizon's or the multiple's.
    const values = Array.from(
      view.container.querySelectorAll(".statlist .v"),
      (v) => v.textContent,
    );
    expect(values).not.toContain(fmtCzk(kpis.netWorthNominal));
    expect(values).not.toContain(fmtMultiple(kpis.netWorthMultiple!));
  });

  it("keeps the as-of values; the note names their basis and how the monthly figures are made", () => {
    const { s, group, view } = renderList(base, true);
    const flow = monthlyFlow(s);
    const row = (g: HTMLElement, k: string) =>
      within(g).getByText(k).nextElementSibling?.textContent;
    expect(row(group(d.kpiGroupReturns), d.netYieldCap)).toBe(
      fmtPct(s.netYield!, 2),
    );
    expect(row(group(d.kpiGroupReturns), d.kpiGrossYield)).toBe(
      fmtPct(s.grossYield!, 2),
    );
    expect(row(group(d.kpiGroupCashFlow), d.kpiMonthlyInflow)).toBe(
      fmtCzk(flow.inflow),
    );
    expect(row(group(d.kpiGroupCashFlow), d.kpiMonthlyOutflow)).toBe(
      fmtCzk(flow.outflow),
    );
    expect(view.container.querySelector(".panel-note")?.textContent).toBe(
      `${d.kpiAsOfGroup(d.basisCurrent)} · ${d.monthlyHint("07.06.2026")}`,
    );
  });

  it("at +5y the note names the projection year and the figures are the year ÷ 12", () => {
    const asOf = addYears(base, 5);
    const { basis, view } = renderList(asOf, false);
    const note = view.container.querySelector(".panel-note")?.textContent;
    expect(note).toBe(
      `${d.kpiAsOfGroup(basisText(en, basis))} · ${d.monthlyHintProjection}`,
    );
    expect(note).not.toContain(d.basisCurrent);
  });

  it("cash invested, when known, closes Returns", () => {
    const { group, labels } = renderList(base, true, money("5200000"));
    expect(labels(group(d.kpiGroupReturns)).at(-1)).toBe(d.kpiCashInvested);
  });
});

describe("The tiles carry the exact value the list no longer shows (ADR 0208 §1)", () => {
  it("the horizon tile's value has the amount in Kč; IRR its rate to two decimals", () => {
    const { props } = setUp(base, true);
    render(
      <KpiStrip {...props} irr={{ rate: rate("0.0615"), reason: null }} />,
    );
    expect(
      screen
        .getByText(fmtCzkM(props.horizon))
        .closest("[title]")
        ?.getAttribute("title"),
    ).toBe(fmtCzk(props.horizon));
    expect(screen.getByTitle(fmtPct(rate("0.0615"), 2))).toBeTruthy();
  });
});
