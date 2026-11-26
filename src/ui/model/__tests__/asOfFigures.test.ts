// The as-of figures of Property detail's tiles and the Dashboard's subtitle, pinned whole,
// so changing how their model functions take their arguments cannot change a figure.
import { describe, expect, it } from "vitest";
import { isoDate, type IsoDate, type Portfolio } from "../../../engine";
import type { Mode } from "../lens";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { getEngineModel } from "../../../state/engineModel";
import { en } from "../../../i18n/en";
import { dashboardFilter } from "../dashboard";
import { dashboardView } from "../dashboardView";
import { propertyBodyView, splitResult } from "../propertyDetailView";

/** Decimals as strings and dates as ISO text, as a snapshot can compare them. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const AS_OFS: [string, IsoDate][] = [
  ["today", BASE_DATE],
  ["records in force", isoDate("2026-09-01")],
  ["future", isoDate("2031-06-07")],
];
const MODES: Mode[] = ["nominal", "real"];

function tiles(p: Portfolio, id: string, asOf: IsoDate, mode: Mode) {
  const { out } = splitResult(
    getEngineModel(p, assumptions).property(id, asOf),
  );
  const property = p.properties.find((x) => x.id === id)!;
  return propertyBodyView(out!, {
    out,
    property,
    portfolio: p,
    assumptions,
    mortgages: p.mortgages.filter((m) => m.propertyId === id),
    mode,
    view: { date: asOf, isToday: asOf === BASE_DATE },
    t: en,
  }).tiles;
}

describe("Property detail's tiles at each as-of and lens", () => {
  const cases = [
    ["seed", portfolio, portfolio.properties[0]!.id],
    ["pending", mixed, "future"],
    ["development", mixed, "dev"],
  ] as const;
  for (const [name, p, id] of cases)
    for (const [when, asOf] of AS_OFS)
      for (const mode of MODES)
        it(`${name}, ${when}, ${mode}`, () => {
          expect(plain(tiles(p, id, asOf, mode))).toMatchSnapshot();
        });
});

describe("the Dashboard's subtitle", () => {
  const ids = portfolio.properties.map((p) => p.id);
  const filters: [string, string[]][] = [
    ["all", []],
    ["one", [ids[0]!]],
    ["two", ids.slice(0, 2)],
  ];
  for (const [f, saved] of filters)
    for (const [when, asOf] of AS_OFS)
      it(`filter ${f}, ${when}`, () => {
        const filter = dashboardFilter(portfolio, saved);
        const engine = getEngineModel(portfolio, assumptions).outputs(
          filter.effectiveIds,
          asOf,
        );
        const v = dashboardView(
          engine,
          "nominal",
          { date: asOf, isToday: asOf === BASE_DATE },
          en,
          filter,
        );
        expect(v.subtitle).toMatchSnapshot();
      });
});
