// @vitest-environment jsdom
//
// #317 (ADR 0194): the projection grid and its export show a future purchase's value in
// its purchase year (`acquiredValue`, ADR 0165), in a Purchases column right after Value.
// Shown only when some year holds one; blank in the opening row; deflated under Real.
import { beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { ProjectionGrid } from "../components/ProjectionGrid";
import { useUiStore } from "../../state/uiStore";
import { portfolioProjection, type Portfolio } from "../../engine";
import { assumptions, portfolio } from "../../engine/__tests__/support/seed";
import { mixed } from "../../engine/__tests__/support/mixed";
import { projectionColumns, projectionSeries } from "../model/projection";
import { en } from "../../i18n/en";
import type { Mode } from "../model/lens";
import { toEquityChangeRows } from "../model/chartData";
import { devBlock } from "../../engine/__tests__/support/mixed";
import { isoDate, money } from "../../engine";
import type { Decimal } from "../../lib/money";
import { roundCzk, toNumber } from "../../lib/format";

const g = en.projGrid;
/** The mixed fixture's development flat, bought after the projection start with both
 *  tranches still ahead (as in dev-committed-debt.test.ts). */
const offPlan: Portfolio = {
  properties: [
    {
      id: "dev",
      name: "Dev unit",
      purchaseDate: isoDate("2027-03-01"),
      purchasePrice: money("7000000"),
    },
  ],
  mortgages: [
    {
      ...devBlock,
      startDate: isoDate("2027-03-01"),
      loanTermYears: 30,
      draws: [
        { date: isoDate("2027-11-15"), amount: money("1500000") },
        { date: isoDate("2028-08-20"), amount: money("1000000") },
      ],
      completionDate: isoDate("2028-08-20"),
    },
  ],
  valuations: [
    {
      id: "v-dev",
      propertyId: "dev",
      validFrom: isoDate("2027-03-01"),
      marketValue: money("9500000"),
    },
  ],
  leases: mixed.leases.filter((l) => l.propertyId === "dev"),
  holdingCosts: [],
};
const series = (p: Portfolio, mode: Mode) =>
  projectionSeries(portfolioProjection(p, assumptions), mode, assumptions);
const headers = (p: Portfolio, mode: Mode = "nominal") =>
  projectionColumns(en, assumptions.baseDate, series(p, mode)).map(
    (c) => c.header,
  );
const gridHeaders = (p: Portfolio) => {
  const { container } = render(
    <ProjectionGrid
      rows={series(p, "nominal")}
      baseDate={assumptions.baseDate}
    />,
  );
  return [...container.querySelectorAll("thead th")].map(
    (th) => th.textContent,
  );
};

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("Purchases column (#317)", () => {
  it("is absent when no future purchase lands in the horizon", () => {
    expect(headers(portfolio)).not.toContain(g.purchases);
    expect(gridHeaders(portfolio)).not.toContain(g.purchases);
  });

  it("follows Value, on screen and in the export", () => {
    for (const h of [headers(mixed), gridHeaders(mixed)]) {
      expect(h.indexOf(g.purchases)).toBe(h.indexOf(g.value) + 1);
    }
  });

  // The figure the equity-change chart stacks as purchases and construction, so a Value
  // rise that is not growth reads the same in the grid, the export and the chart.
  for (const [name, p] of [
    ["a purchase with a plain loan, a development flat", mixed],
    ["an off-plan purchase", offPlan],
  ] as const) {
    for (const mode of ["nominal", "real"] as const) {
      it(`matches the chart's purchases, ${name}, ${mode}`, () => {
        const rows = series(p, mode);
        const col = projectionColumns(en, assumptions.baseDate, rows).find(
          (c) => c.header === g.purchases,
        )!;
        expect(col.kind).toBe("money");
        expect(col.value(rows[0]!)).toBeNull();
        const chart = toEquityChangeRows(rows);
        for (const [i, r] of rows.slice(1).entries()) {
          expect(toNumber(col.value(r) as Decimal)).toBe(chart[i]!.purchases);
        }
      });
    }
  }

  it("an off-plan purchase counts its value less the tranches not drawn yet", () => {
    const rows = series(offPlan, "nominal");
    const col = projectionColumns(en, assumptions.baseDate, rows).find(
      (c) => c.header === g.purchases,
    )!;
    // 9.5 M completed value, 2.5 M of the loan still to draw in the purchase year.
    expect(roundCzk(col.value(rows[1]!) as Decimal).toNumber()).toBe(7_000_000);
  });

  it("dashes the opening row on screen", () => {
    const { container } = render(
      <ProjectionGrid
        rows={series(mixed, "nominal")}
        baseDate={assumptions.baseDate}
      />,
    );
    const h = [...container.querySelectorAll("thead th")].map(
      (th) => th.textContent,
    );
    const opening = container.querySelectorAll("tbody tr")[0]!;
    expect(
      opening.querySelectorAll("td")[h.indexOf(g.purchases)]!.textContent,
    ).toBe("—");
  });
});
