// @vitest-environment jsdom
//
// ADR 0087 (#11): every Dashboard KPI row follows the lens or says it is nominal; the hero
// foot shows the lens-matched multiple "from projection start".
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { portfolioKpis, portfolioSnapshot } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { fmtMultiple } from "../../../lib/format";
import { lensKpis } from "../../model/lensKpis";
import type { Mode } from "../../model/lens";
import { KpiStrip, KpiListPanel } from "../DashboardPanels";
import { rowLabel } from "./kpiStripSupport";

const s = portfolioSnapshot(portfolio, assumptions);
const kpis = portfolioKpis(portfolio, assumptions);
const N = assumptions.horizonYears;

function renderPanels(mode: Mode) {
  const real = mode === "real";
  return render(
    <>
      <KpiStrip
        s={s}
        basis={{ kind: "today" }}
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
        basis={{ kind: "today" }}
        kpis={kpis}
        mode={mode}
        horizonYears={N}
        cashInvested={null}
      />
    </>,
  );
}

describe("Dashboard KPIs by lens (ADR 0087)", () => {
  it("real: multiple and cumulative CF are real, principal repaid says nominal", () => {
    const { container } = renderPanels("real");
    const real = fmtMultiple(kpis.netWorthMultipleReal!);
    const nominal = fmtMultiple(kpis.netWorthMultiple!);
    expect(screen.getByText(en.dashboard.bandMultiple(real))).toBeTruthy();
    // The horizon group is named by its caption, which carries the lens (ADR 0222).
    expect(
      screen.getByRole("group", {
        name: new RegExp(`· ${N}-yr horizon · real$`),
      }),
    ).toBeTruthy();
    expect(container.textContent).not.toContain(nominal);
    expect(screen.getByText(en.dashboard.kpiHintReal)).toBeTruthy();
    expect(
      screen.getByText(rowLabel(en.dashboard.kpiSumPrincipalRepaidNominal(N))),
    ).toBeTruthy();
    expect(
      screen.queryByText(rowLabel(en.dashboard.kpiSumPrincipalRepaid(N))),
    ).toBeNull();
  });

  it("nominal: nominal multiple, plain principal label", () => {
    renderPanels("nominal");
    const nominal = fmtMultiple(kpis.netWorthMultiple!);
    expect(screen.getByText(en.dashboard.bandMultiple(nominal))).toBeTruthy();
    expect(
      screen.getByRole("group", {
        name: new RegExp(`· ${N}-yr horizon · nominal$`),
      }),
    ).toBeTruthy();
    expect(screen.getByText(en.dashboard.kpiHintNominal)).toBeTruthy();
    expect(
      screen.getByText(rowLabel(en.dashboard.kpiSumPrincipalRepaid(N))),
    ).toBeTruthy();
  });

  it("the cumulative CF row shows the lens value", () => {
    const real = renderPanels("real").container.textContent ?? "";
    const nominal = renderPanels("nominal").container.textContent ?? "";
    expect(real).not.toBe(nominal);
  });
});
