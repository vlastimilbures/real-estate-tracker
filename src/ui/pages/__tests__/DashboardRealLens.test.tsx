// @vitest-environment jsdom
//
// ADR 0087 (#11): every Dashboard KPI row follows the lens or says it is nominal; the hero
// foot shows the lens-matched multiple "from projection start".
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { portfolioKpis, portfolioSnapshot } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { fmtMultiple } from "../../../lib/format";
import { lensKpis } from "../../model/lensKpis";
import type { Mode } from "../../model/lens";
import { HeroTiles, KpiListPanel } from "../DashboardPanels";

const s = portfolioSnapshot(portfolio, assumptions);
const kpis = portfolioKpis(portfolio, assumptions);
const N = assumptions.horizonYears;

function renderPanels(mode: Mode) {
  const real = mode === "real";
  return render(
    <>
      <HeroTiles
        s={s}
        mode={mode}
        isToday
        horizon={real ? kpis.netWorthReal : kpis.netWorthNominal}
        horizonYears={N}
        horizonEndYear={2056}
        netWorthMultiple={lensKpis(kpis, mode).netWorthMultiple}
        modeWord={real ? en.common.realLower : en.common.nominalLower}
        irr={{ rate: null, reason: "NO_ROOT" }}
      />
      <KpiListPanel
        s={s}
        kpis={kpis}
        mode={mode}
        horizon={real ? kpis.netWorthReal : kpis.netWorthNominal}
        horizonYears={N}
        irr={{ rate: null, reason: "NO_ROOT" }}
        cashInvested={null}
      />
    </>,
  );
}

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Dashboard KPIs by lens (ADR 0087)", () => {
  it("real: multiple and cumulative CF are real, principal repaid says nominal", () => {
    const { container } = renderPanels("real");
    const real = fmtMultiple(kpis.netWorthMultipleReal);
    const nominal = fmtMultiple(kpis.netWorthMultiple);
    expect(
      screen.getByText(en.dashboard.multipleFromStartMode(real, "real")),
    ).toBeTruthy();
    expect(container.textContent).not.toContain(nominal);
    expect(screen.getByText(en.dashboard.kpiHintReal)).toBeTruthy();
    expect(
      screen.getByText(en.dashboard.kpiSumPrincipalRepaidNominal(N)),
    ).toBeTruthy();
    expect(
      screen.queryByText(en.dashboard.kpiSumPrincipalRepaid(N)),
    ).toBeNull();
  });

  it("nominal: nominal multiple, plain principal label", () => {
    renderPanels("nominal");
    const nominal = fmtMultiple(kpis.netWorthMultiple);
    expect(
      screen.getByText(en.dashboard.multipleFromStartMode(nominal, "nominal")),
    ).toBeTruthy();
    expect(screen.getByText(en.dashboard.kpiHintNominal)).toBeTruthy();
    expect(
      screen.getByText(en.dashboard.kpiSumPrincipalRepaid(N)),
    ).toBeTruthy();
  });

  it("the cumulative CF row shows the lens value", () => {
    const real = renderPanels("real").container.textContent ?? "";
    const nominal = renderPanels("nominal").container.textContent ?? "";
    expect(real).not.toBe(nominal);
  });
});
