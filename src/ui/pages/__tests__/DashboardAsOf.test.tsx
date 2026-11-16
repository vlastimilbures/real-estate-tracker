// @vitest-environment jsdom
//
// ADR 0088 (#13): at a future as-of date no Dashboard tile or hint says "today" or
// "current", and the horizon tile names its end year whatever the as-of date.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  addYears,
  portfolioKpis,
  portfolioProjection,
  portfolioSnapshot,
} from "../../../engine";
import type { IsoDate } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { projectionSeries } from "../../model/projection";
import { asOfView, horizonEndYear, tilesForAsOf } from "../../model/dashboard";
import { KpiStrip } from "../DashboardPanels";

const kpis = portfolioKpis(portfolio, assumptions);
const series = projectionSeries(
  portfolioProjection(portfolio, assumptions),
  "nominal",
  assumptions,
);
const base = assumptions.baseDate;

function renderAt(asOf: IsoDate, isToday: boolean) {
  const snapshot = portfolioSnapshot(portfolio, assumptions, asOf);
  const basis = asOfView(base, asOf, isToday);
  const s = tilesForAsOf(snapshot, series, basis, "nominal", assumptions);
  return render(
    <KpiStrip
      s={s}
      basis={basis}
      mode="nominal"
      isToday={isToday}
      horizon={kpis.netWorthNominal}
      horizonYears={assumptions.horizonYears}
      horizonEndYear={horizonEndYear(series)}
      netWorthMultiple={kpis.netWorthMultiple}
      modeWord={en.common.nominalLower}
      irr={{ rate: null, reason: "NO_ROOT" }}
    />,
  );
}

describe("Dashboard as-of labels (ADR 0088, 0200)", () => {
  const endYear = horizonEndYear(series);
  // The horizon group's caption names the last projection year (ADR 0222 §2).
  const horizonLabel = en.dashboard.bandHorizonCaption(
    endYear,
    assumptions.horizonYears,
    en.common.nominalLower,
  );
  // A caption starts with a capital (ADR 0222 §2).
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  it("+5y: no tile says today or current; the strip names projection year Y5", () => {
    const { container } = renderAt(addYears(base, 5), false);
    expect(container.textContent).not.toMatch(/today|current/i);
    expect(container.textContent).toContain(
      cap(en.dashboard.basisProjection(`Y5 · ${base.getUTCFullYear() + 5}`)),
    );
    expect(screen.getByText(horizonLabel)).toBeTruthy();
  });

  it("today: current wording", () => {
    const { container } = renderAt(base, true);
    expect(container.textContent).toContain(cap(en.dashboard.basisCurrent));
    expect(screen.getByText(horizonLabel)).toBeTruthy();
  });

  it("the horizon label names the last projection year", () => {
    expect(endYear).toBe(base.getUTCFullYear() + assumptions.horizonYears);
  });
});
