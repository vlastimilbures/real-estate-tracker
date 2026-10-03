// UX-055 (DR-093, D-62): Scenario compare honours the Nominal/Real lens, with each
// scenario's own CPI index (so an inflation shock shows in real terms).
import { describe, it, expect } from "vitest";
import {
  applyScenario,
  cpiIndex,
  portfolioKpis,
  portfolioProjection,
  rate,
  realProjection,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { toNumber } from "../../../lib/money";
import { en } from "../../../i18n/en";
import {
  compareHint,
  compareKpiRows,
  mergeCompareMetric,
  type CompareResult,
} from "../compare";

function result(id: string, overrides = {}): CompareResult {
  const assn = applyScenario(assumptions, overrides);
  const projection = portfolioProjection(portfolio, assn);
  return {
    id,
    name: id,
    projection,
    realProjection: realProjection(projection, cpiIndex(assn)),
    kpis: portfolioKpis(portfolio, assn),
  };
}

const base = result("base");
const shocked = result("shock", {
  inflationShock: { deltaPa: rate("0.06"), durationYears: 3 },
});

describe("mergeCompareMetric", () => {
  it("nominal rows plot each scenario's nominal projection", () => {
    const rows = mergeCompareMetric(
      [base, shocked],
      "nominal",
      (y) => y.equity,
    );
    expect(rows[10].s0).toBe(toNumber(base.projection[10].equity));
    expect(rows[10].s1).toBe(toNumber(shocked.projection[10].equity));
    expect(rows[10].calendarYear).toBe(base.projection[10].calendarYear);
  });

  it("real rows deflate each scenario by its own CPI (the shock shows)", () => {
    const rows = mergeCompareMetric([base, shocked], "real", (y) => y.equity);
    const cpiShock = cpiIndex(
      applyScenario(assumptions, {
        inflationShock: { deltaPa: rate("0.06"), durationYears: 3 },
      }),
    );
    expect(rows[10].s1).toBe(
      toNumber(shocked.projection[10].equity.div(cpiShock[10])),
    );
    expect(rows[10].s1).toBeLessThan(rows[10].s0);
  });
});

describe("compareKpiRows", () => {
  it("nominal: CAGR and IRR rows are nominal", () => {
    const rows = compareKpiRows(en, "nominal");
    const labels = rows.map((r) => r.label);
    expect(labels).toContain(en.scenarios.kpiCagrNominal);
    expect(labels).toContain(en.scenarios.kpiLeveredIrrNominal);
    expect(labels).toContain(en.scenarios.kpiCumulativeNetCf);
  });

  it("real: CAGR and IRR rows switch to their real values and labels", () => {
    const rows = compareKpiRows(en, "real");
    const cagr = rows.find((r) => r.label === en.scenarios.kpiCagrReal);
    const irr = rows.find((r) => r.label === en.scenarios.kpiLeveredIrrReal);
    expect(cagr?.fmt(base)).toBe("2,8 %");
    expect(irr?.fmt(base)).toBe("3,6 %");
  });

  it("real: the multiple and cumulative CF switch to their real values (ADR 0087)", () => {
    const value = (mode: "nominal" | "real", label: string) =>
      compareKpiRows(en, mode)
        .find((r) => r.label === label)
        ?.fmt(base);
    const multiple = en.scenarios.kpiNetWorthMultiple;
    const cumCf = en.scenarios.kpiCumulativeNetCf;
    expect(value("real", multiple)).toBe("2,31x");
    expect(value("nominal", multiple)).toBe("4,85x");
    expect(value("real", cumCf)).not.toBe(value("nominal", cumCf));
  });

  it("an IRR with no value reads n/a with its reason (UX-079, DR-158)", () => {
    const flat: CompareResult = {
      ...base,
      kpis: {
        ...base.kpis,
        leveredIrrNominal: null,
        leveredIrrNominalReason: "NOT_UNIQUE",
      },
    };
    const irr = compareKpiRows(en, "nominal").find(
      (r) => r.label === en.scenarios.kpiLeveredIrrNominal,
    )!;
    expect(irr.fmt(flat)).toBe(en.common.notApplicable);
    expect(irr.note?.(flat)).toBe(en.common.irrNotUnique);
    expect(irr.note?.(base)).toBeUndefined();
  });

  it("the hint follows the lens", () => {
    expect(compareHint(en, "nominal")).toBe(en.scenarios.keyFiguresHint);
    expect(compareHint(en, "real")).toBe(en.scenarios.keyFiguresHintReal);
  });
});
