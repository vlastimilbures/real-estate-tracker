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
import { toNumber, type Decimal } from "../../../lib/money";
import { fmtCzkM, fmtMultiple, fmtPp } from "../../../lib/format";
import { en } from "../../../i18n/en";
import {
  compareFootnote,
  compareHint,
  compareKpiRows,
  compareSeriesStyle,
  mergeCompareMetric,
  type CompareResult,
} from "../compare";
import { SERIES } from "../chartData";

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

const crash = result("crash", {
  valueShock: { pct: rate("0.2"), atYear: 0 },
});
const rateShock = result("rate", {
  rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
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
    expect(rows[10].s1).toBeLessThan(rows[10].s0!);
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

// ADR 0089 (#14): a crash at Today lowers starting equity, so the table shows the owner's
// loss next to the rebased returns.
describe("compare owner loss (ADR 0089)", () => {
  const row = (mode: "nominal" | "real", label: string, b = base) =>
    compareKpiRows(en, mode, b).find((r) => r.label === label);
  const start = en.scenarios.kpiStartingEquity;
  const delta = en.scenarios.kpiNetWorthDeltaVsBase;

  it("starting equity and Δ net worth vs Base lead the table", () => {
    const labels = compareKpiRows(en, "nominal", base).map((r) => r.label);
    expect(labels.slice(0, 2)).toEqual([start, delta]);
  });

  it("starting equity is projection year 0 equity under the lens", () => {
    expect(row("nominal", start)?.fmt(base)).toBe("19,2 M Kč");
    expect(row("nominal", start)?.fmt(crash)).toBe("13,5 M Kč");
    expect(row("real", start)?.fmt(crash)).toBe(
      fmtCzkM(crash.realProjection[0].equity),
    );
  });

  it("Δ net worth is the scenario's lens net worth minus Base's", () => {
    expect(row("nominal", delta)?.fmt(base)).toBe("—");
    expect(row("nominal", delta)?.fmt(crash)).toBe("−18,6 M Kč");
    expect(row("real", delta)?.fmt(crash)).toBe(
      fmtCzkM(crash.kpis.netWorthReal.minus(base.kpis.netWorthReal)),
    );
    expect(row("real", delta)?.fmt(crash)).not.toBe(
      row("nominal", delta)?.fmt(crash),
    );
  });

  it("a gain shows a plus sign", () => {
    const gain: CompareResult = {
      ...base,
      id: "gain",
      kpis: {
        ...base.kpis,
        netWorthNominal: base.kpis.netWorthNominal.plus(1_000_000),
      },
    };
    expect(row("nominal", delta)?.fmt(gain)).toBe("+1,0 M Kč");
  });

  it("without Base in the comparison there is no Δ row", () => {
    const labels = compareKpiRows(en, "nominal").map((r) => r.label);
    expect(labels).toContain(start);
    expect(labels).not.toContain(delta);
  });

  it("marks the rebased returns only for a scenario whose starting equity differs", () => {
    const marked = (r: CompareResult) =>
      compareKpiRows(en, "real", base)
        .filter((k) => k.mark?.(r))
        .map((k) => k.label);
    expect(marked(crash)).toEqual([
      en.scenarios.kpiNetWorthMultiple,
      en.scenarios.kpiCagrReal,
      en.scenarios.kpiLeveredIrrReal,
    ]);
    expect(marked(base)).toEqual([]);
    expect(marked(rateShock)).toEqual([]);
    expect(marked(shocked)).toEqual([]);
  });

  it("the footnote appears only when a starting equity differs from Base's", () => {
    expect(compareFootnote(en, [base, crash, rateShock])).toBe(
      en.scenarios.rebasedReturnsFootnote("crash"),
    );
    expect(compareFootnote(en, [base, rateShock, shocked])).toBeNull();
    expect(compareFootnote(en, [crash, rateShock])).toBeNull();
  });
});

// ADR 0097 (#53): with Base in the comparison every key figure can show the scenario's
// value minus Base's, in the row's own unit.
describe("Δ vs Base view (ADR 0097)", () => {
  const sc = en.scenarios;
  const rowsOf = (mode: "nominal" | "real" = "nominal", b = base) =>
    compareKpiRows(en, mode, b, "delta");
  const row = (label: string, mode: "nominal" | "real" = "nominal", b = base) =>
    rowsOf(mode, b).find((r) => r.label === label)!;
  const plus = (d: Decimal, s: string) => (d.gt(0) ? `+${s}` : s);

  it("the Base column reads — in every row", () => {
    for (const r of rowsOf()) expect(r.fmt(base)).toBe("—");
  });

  it("hides the separate Δ net worth row; values mode keeps it", () => {
    const labels = rowsOf().map((r) => r.label);
    expect(labels).not.toContain(sc.kpiNetWorthDeltaVsBase);
    expect(labels[0]).toBe(sc.kpiStartingEquity);
    expect(
      compareKpiRows(en, "nominal", base, "values").map((r) => r.label),
    ).toContain(sc.kpiNetWorthDeltaVsBase);
  });

  it("without Base the delta view returns the values rows", () => {
    const delta = compareKpiRows(en, "nominal", undefined, "delta");
    const values = compareKpiRows(en, "nominal");
    expect(delta.map((r) => r.label)).toEqual(values.map((r) => r.label));
    expect(delta.map((r) => r.fmt(crash))).toEqual(
      values.map((r) => r.fmt(crash)),
    );
  });

  it("money rows show signed M Kč", () => {
    expect(row(sc.kpiNetWorthNominal).fmt(crash)).toBe("−18,6 M Kč");
    expect(row(sc.kpiStartingEquity).fmt(crash)).toBe(
      fmtCzkM(crash.projection[0].equity.minus(base.projection[0].equity)),
    );
    expect(row(sc.kpiStartingEquity).fmt(shocked)).toBe("0,0 M Kč");
    const cf = rateShock.kpis.cumulativeNetCashFlow.minus(
      base.kpis.cumulativeNetCashFlow,
    );
    expect(row(sc.kpiCumulativeNetCf).fmt(rateShock)).toBe(
      plus(cf, fmtCzkM(cf)),
    );
  });

  it("a gain carries a plus sign", () => {
    const gain: CompareResult = {
      ...base,
      id: "gain",
      kpis: {
        ...base.kpis,
        netWorthNominal: base.kpis.netWorthNominal.plus(1_000_000),
      },
    };
    expect(row(sc.kpiNetWorthNominal).fmt(gain)).toBe("+1,0 M Kč");
  });

  it("rate rows show signed percentage points", () => {
    const cagr = crash.kpis.cagrNominal!.minus(base.kpis.cagrNominal!);
    expect(cagr.gt(0)).toBe(true);
    expect(row(sc.kpiCagrNominal).fmt(crash)).toBe(
      `+${fmtPp(cagr)} ${sc.ppSuffix}`,
    );
    const irr = rateShock.kpis.leveredIrrNominal!.minus(
      base.kpis.leveredIrrNominal!,
    );
    expect(row(sc.kpiLeveredIrrNominal).fmt(rateShock)).toBe(
      `${plus(irr, fmtPp(irr))} ${sc.ppSuffix}`,
    );
  });

  it("the multiple shows a signed multiple", () => {
    const m = crash.kpis.netWorthMultiple!.minus(base.kpis.netWorthMultiple!);
    expect(row(sc.kpiNetWorthMultiple).fmt(crash)).toBe(
      plus(m, fmtMultiple(m)),
    );
  });

  it("year rows show signed whole years", () => {
    const d =
      rateShock.kpis.firstCashFlowPositiveYear! -
      base.kpis.firstCashFlowPositiveYear!;
    expect(d).not.toBe(0);
    expect(row(sc.kpiFirstCfPositiveYear).fmt(rateShock)).toBe(
      sc.deltaYears(d),
    );
    expect(row(sc.kpiDebtFreeYear).fmt(shocked)).toBe(
      sc.deltaYears(shocked.kpis.debtFreeYear! - base.kpis.debtFreeYear!),
    );
  });

  it("deltaYears signs the number", () => {
    expect(sc.deltaYears(3)).toBe("+3y");
    expect(sc.deltaYears(-2)).toBe("−2y");
    expect(sc.deltaYears(0)).toBe("0y");
  });

  it("a missing value on either side reads — with a note", () => {
    const noIrr: CompareResult = {
      ...base,
      id: "noirr",
      kpis: {
        ...base.kpis,
        leveredIrrNominal: null,
        leveredIrrNominalReason: "NO_ROOT",
        debtFreeYear: null,
      },
    };
    const irr = row(sc.kpiLeveredIrrNominal);
    expect(irr.fmt(noIrr)).toBe("—");
    expect(irr.note?.(noIrr)).toBe(en.common.irrNoRoot);
    expect(irr.note?.(crash)).toBeUndefined();
    expect(row(sc.kpiDebtFreeYear).fmt(noIrr)).toBe("—");

    const vsNullBase = row(sc.kpiLeveredIrrNominal, "nominal", noIrr);
    expect(vsNullBase.fmt(crash)).toBe("—");
    expect(vsNullBase.note?.(crash)).toBe(sc.deltaNoBaseValue);
  });

  it("a multiple with no growth base reads — (ADR 0126)", () => {
    const noBase: CompareResult = {
      ...base,
      id: "nobase",
      kpis: { ...base.kpis, netWorthMultiple: null, cagrNominal: null },
    };
    const values = compareKpiRows(en, "nominal").find(
      (r) => r.label === sc.kpiNetWorthMultiple,
    )!;
    expect(values.fmt(noBase)).toBe("—");
    expect(row(sc.kpiNetWorthMultiple).fmt(noBase)).toBe("—");
    const vsNullBase = row(sc.kpiNetWorthMultiple, "nominal", noBase);
    expect(vsNullBase.fmt(crash)).toBe("—");
    expect(vsNullBase.note?.(crash)).toBe(sc.deltaNoBaseValue);
  });

  it("the real lens uses the real figures", () => {
    const nw = crash.kpis.netWorthReal.minus(base.kpis.netWorthReal);
    expect(row(sc.kpiNetWorthReal, "real").fmt(crash)).toBe(fmtCzkM(nw));
    const m = crash.kpis.netWorthMultipleReal!.minus(
      base.kpis.netWorthMultipleReal!,
    );
    expect(row(sc.kpiNetWorthMultiple, "real").fmt(crash)).toBe(
      plus(m, fmtMultiple(m)),
    );
    const cagr = crash.kpis.cagrReal!.minus(base.kpis.cagrReal!);
    expect(row(sc.kpiCagrReal, "real").fmt(crash)).toBe(
      `${plus(cagr, fmtPp(cagr))} ${sc.ppSuffix}`,
    );
    const irr = crash.kpis.leveredIrrReal!.minus(base.kpis.leveredIrrReal!);
    expect(row(sc.kpiLeveredIrrReal, "real").fmt(crash)).toBe(
      `${plus(irr, fmtPp(irr))} ${sc.ppSuffix}`,
    );
  });

  it("keeps the rebased-returns marks", () => {
    const marked = rowsOf()
      .filter((k) => k.mark?.(crash))
      .map((k) => k.label);
    expect(marked).toEqual([
      sc.kpiNetWorthMultiple,
      sc.kpiCagrNominal,
      sc.kpiLeveredIrrNominal,
    ]);
  });
});

// ADR 0114: compare lines differ by dash as well as colour, so they read in greyscale.
describe("compareSeriesStyle", () => {
  it("pairs each position with a colour and a dash, the first line solid", () => {
    expect([0, 1, 2, 3].map((i) => compareSeriesStyle(i))).toEqual([
      { color: SERIES.petrol, dash: undefined },
      { color: SERIES.clay, dash: "6 3" },
      { color: SERIES.brass, dash: "2 3" },
      { color: SERIES.slate, dash: "8 3 2 3" },
    ]);
  });

  it("cycles after four lines", () => {
    expect(compareSeriesStyle(4)).toEqual(compareSeriesStyle(0));
    expect(compareSeriesStyle(5)).toEqual(compareSeriesStyle(1));
  });
});
