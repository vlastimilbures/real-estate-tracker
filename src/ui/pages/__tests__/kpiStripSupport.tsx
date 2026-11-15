// Renders the Dashboard KPI strip (ADR 0200) for a snapshot at Today, nominal, with the
// seed's horizon figures: for tests that look at one tile.
import { render } from "@testing-library/react";
import { portfolioKpis, type PortfolioSnapshot } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { KpiStrip } from "../DashboardPanels";

const kpis = portfolioKpis(portfolio, assumptions);

export function renderStrip(s: PortfolioSnapshot) {
  return render(
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
      irr={{ rate: null, reason: "NO_ROOT" }}
    />,
  );
}
