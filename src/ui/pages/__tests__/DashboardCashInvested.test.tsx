// @vitest-environment jsdom
//
// ADR 0119 §9 (#33 PR3): the Dashboard KPI list shows "Cash invested", the own cash of the
// active properties in the filter, only when every one of them has it. It is a recorded
// nominal amount, so the real lens says so (as Σ principal, ADR 0087).
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  money,
  portfolioKpis,
  portfolioSnapshot,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { D } from "../../../lib/money";
import { fmtCzk } from "../../../lib/format";
import type { Mode } from "../../model/lens";
import { KpiListPanel } from "../DashboardPanels";
import { Dashboard } from "../Dashboard";

const dash = en.dashboard;
const s = portfolioSnapshot(portfolio, assumptions);
const kpis = portfolioKpis(portfolio, assumptions);

function renderList(mode: Mode, cashInvested: ReturnType<typeof D> | null) {
  render(
    <KpiListPanel
      s={s}
      kpis={kpis}
      mode={mode}
      horizon={kpis.netWorthNominal}
      horizonYears={assumptions.horizonYears}
      irr={{ rate: null, reason: "NO_ROOT" }}
      cashInvested={cashInvested}
    />,
  );
}

/** The value shown next to a KPI row's label, or null without the row. */
const row = (label: string) =>
  screen.queryByText(label)?.nextElementSibling?.textContent ?? null;

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("KPI list Cash invested row (ADR 0119 §9)", () => {
  it("shows the total under its plain label in the nominal lens", () => {
    renderList("nominal", D(4_500_000));
    expect(row(dash.kpiCashInvested)).toBe(fmtCzk(4_500_000));
  });

  it("says the total is nominal in the real lens", () => {
    renderList("real", D(4_500_000));
    expect(row(dash.kpiCashInvestedNominal)).toBe(fmtCzk(4_500_000));
    expect(screen.queryByText(dash.kpiCashInvested)).toBeNull();
  });

  it("has no row without a total", () => {
    renderList("nominal", null);
    expect(screen.queryByText(dash.kpiCashInvested)).toBeNull();
  });
});

describe("Cash invested on the Dashboard page (ADR 0119 §9)", () => {
  const own: Record<string, string> = {
    javorova: "1500000",
    lipova: "1700000",
    dubova: "2000000",
  };
  function show(p: Portfolio, filter: string[] = []) {
    act(() => {
      usePortfolioStore.setState({
        status: "ready",
        portfolio: p,
        assumptions,
        scenarios: [],
        sample: { active: false, dismissed: true },
      });
      useUiStore.setState({
        route: "dashboard",
        dashboardPropertyIds: filter,
        asOf: null,
        mode: "nominal",
      });
    });
    render(<Dashboard />);
  }
  const recorded = (except: string[] = []): Portfolio => ({
    ...portfolio,
    properties: portfolio.properties.map((p) =>
      except.includes(p.id)
        ? p
        : { ...p, funding: { ownCash: money(own[p.id]!) } },
    ),
  });

  it("totals the own cash once every active property has it", () => {
    show(recorded());
    expect(row(dash.kpiCashInvested)).toBe(fmtCzk(5_200_000));
  });

  it("shows no total while one property has no own cash", () => {
    show(recorded(["dubova"]));
    expect(screen.queryByText(dash.kpiCashInvested)).toBeNull();
  });

  it("follows the property filter", () => {
    show(recorded(["dubova"]), ["javorova", "lipova"]);
    expect(row(dash.kpiCashInvested)).toBe(fmtCzk(3_200_000));
  });
});
