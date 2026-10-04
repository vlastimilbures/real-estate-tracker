// ADR 0116 §12, ADR 0130: optional columns show from half a haléř; a refix shows a
// "Refinance difference" column, not "Drawn" / "Draws".
import { describe, it, expect } from "vitest";
import {
  isoDate,
  money,
  portfolioProjection,
  propertySchedules,
  rate,
  type MortgageBlock,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { D } from "../../../lib/money";
import { nonZeroColumns } from "../columns";
import { projectionExtras, projectionSeries } from "../projection";
import { amortizationColumns, amortizationExtras } from "../propertyDetail";

const withRefi = (principal: string): Portfolio => ({
  ...portfolio,
  mortgages: [
    ...portfolio.mortgages,
    {
      id: "m-refi",
      propertyId: "javorova",
      startDate: isoDate("2031-01-17"),
      initialPrincipal: money(principal),
      fixationYears: 5,
      interestRatePa: rate("0.039"),
      monthlyInstalment: money("9800"),
    } as MortgageBlock,
  ],
});

function extras(p: Portfolio) {
  const ids = p.properties.map((x) => x.id);
  const rows = propertySchedules(p.mortgages, ids, assumptions).get(
    "javorova",
  )!.rows;
  const series = projectionSeries(
    portfolioProjection(p, assumptions),
    "nominal",
    assumptions,
  );
  return {
    rows,
    amortization: amortizationExtras(rows, en.propertyDetail).map((c) => c.key),
    projection: projectionExtras(series, en.projGrid).map((c) => c.key),
  };
}

describe("nonZeroColumns: from half a haléř (ADR 0130)", () => {
  const cols = [{ key: "a" as const, header: "A" }];
  it.each([
    ["0", false],
    ["0.0049", false],
    ["-0.0049", false],
    ["0.005", true],
    ["-0.005", true],
    ["-249.89", true],
  ])("a column whose only value is %s is shown: %s", (v, shown) => {
    expect(nonZeroColumns([{ a: D(v) }], cols).length).toBe(shown ? 1 : 0);
  });
});

describe("the refinance difference column (ADR 0130)", () => {
  it("a refix rounded to 1,000 Kč shows Refinance difference, not Drawn / Draws", () => {
    const { amortization, projection } = extras(withRefi("1386000"));
    expect(amortization).toEqual(["refinanced"]);
    expect(projection).toEqual(["refinanced"]);
  });

  it("a refix typed to the haléř shows no column", () => {
    const { amortization, projection } = extras(withRefi("1386249.89"));
    expect(amortization).toEqual([]);
    expect(projection).toEqual([]);
  });

  it("is named in every language and exported like the screen", () => {
    expect(en.propertyDetail.amColRefinanced).toBe("Refinance difference");
    expect(en.projGrid.refinanced).toBe("Refinance difference");
    expect(cs.propertyDetail.amColRefinanced).toBe("Rozdíl při refinancování");
    expect(cs.projGrid.refinanced).toBe("Rozdíl při refinancování");
    expect(ru.propertyDetail.amColRefinanced).toBe(
      "Разница при рефинансировании",
    );
    expect(ru.projGrid.refinanced).toBe("Разница при рефинансировании");
    const { rows } = extras(withRefi("1386000"));
    const headers = amortizationColumns(en, rows).map((c) => c.header);
    expect(headers).toContain("Refinance difference");
    expect(headers).not.toContain(en.propertyDetail.amColDrawn);
  });
});
