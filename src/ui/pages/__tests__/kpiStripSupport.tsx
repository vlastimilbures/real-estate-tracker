// Renders the Dashboard KPI strip (ADR 0200) for a snapshot at Today, nominal, with the
// seed's horizon figures: for tests that look at one tile.
import { render } from "@testing-library/react";
import { portfolioKpis, type PortfolioSnapshot } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { KpiStrip } from "../DashboardPanels";
import { stripView } from "./dashboardViewSupport";

const kpis = portfolioKpis(portfolio, assumptions);

export function renderStrip(s: PortfolioSnapshot) {
  return render(
    <KpiStrip
      view={stripView({
        s,
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

/** Matches a key-figures row label by its whole text: a label's parenthetical sits in its
 *  own no-wrap span (ADR 0208 §3), so the plain text matcher would not see it. */
export const rowLabel = (text: string) => (_: string, el: Element | null) =>
  el?.classList.contains("k") === true && el.textContent === text;
