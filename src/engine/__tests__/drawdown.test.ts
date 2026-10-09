// ADR 0167 §6: a development loan's drawdown as of a date. The start draw and each tranche
// is drawn when dated on or before as-of, else ahead; a tranche dated after a successor
// block's start is never drawn (the committed-debt rule, ADR 0166). At baseDate the
// tranches ahead are the undrawn principal the Debt tile counts.
import { describe, it, expect } from "vitest";
import { propertyLoanExposure } from "../financing";
import { propertySchedule, undrawnPrincipal } from "../schedule";
import { isoDate } from "../dates";
import { money } from "../brands";
import type { IsoDate, MortgageBlock } from "../types";
import { BASE_DATE, assumptions, portfolio } from "./support/seed";
import { devBlock, mixed } from "./support/mixed";
import { expectKc } from "./support/tolerance";

function drawdowns(blocks: MortgageBlock[], asOf: IsoDate = BASE_DATE) {
  const s = propertySchedule(blocks, assumptions);
  return propertyLoanExposure(
    blocks,
    assumptions,
    { rows: s.rows, eventOutcomes: s.eventOutcomes },
    asOf,
  )!.drawdowns;
}

const statuses = (blocks: MortgageBlock[], asOf?: IsoDate) =>
  drawdowns(blocks, asOf)[0]!.tranches.map((t) => t.status);

describe("drawdown progress (ADR 0167)", () => {
  it("lists the start draw first, then each tranche, with drawn and total", () => {
    const [dd] = drawdowns([devBlock]);
    expect(dd!.blockId).toBe("m-dev");
    expect(
      dd!.tranches.map((t) => [t.date, t.amount.toString(), t.start]),
    ).toEqual([
      [isoDate("2026-03-01"), "2000000", true],
      [isoDate("2026-11-15"), "1500000", false],
      [isoDate("2027-08-20"), "1000000", false],
    ]);
    expect(dd!.tranches.map((t) => t.status)).toEqual([
      "drawn",
      "ahead",
      "ahead",
    ]);
    expectKc(dd!.drawn, 2000000);
    expectKc(dd!.total, 4500000);
  });

  it("at baseDate the tranches ahead are the undrawn principal (ADR 0166)", () => {
    const [dd] = drawdowns([devBlock]);
    const ahead = dd!.total.minus(dd!.drawn);
    const dev = mixed.properties.find((p) => p.id === "dev")!;
    expectKc(
      ahead,
      undrawnPrincipal(dev, [devBlock], assumptions, 0).toNumber(),
    );
  });

  it("a later as-of draws the tranches dated on or before it", () => {
    expect(statuses([devBlock], isoDate("2026-11-15"))).toEqual([
      "drawn",
      "drawn",
      "ahead",
    ]);
    const [late] = drawdowns([devBlock], isoDate("2028-01-01"));
    expect(late!.tranches.every((t) => t.status === "drawn")).toBe(true);
    expect(late!.drawn.equals(late!.total)).toBe(true);
  });

  it("a loan that starts after as-of has its start draw ahead", () => {
    const [dd] = drawdowns([devBlock], isoDate("2026-02-01"));
    expect(dd!.tranches.map((t) => t.status)).toEqual([
      "ahead",
      "ahead",
      "ahead",
    ]);
    expectKc(dd!.drawn, 0);
  });

  it("a tranche dated after a successor's start is never drawn and leaves the total", () => {
    const successor: MortgageBlock = {
      id: "m-refi",
      propertyId: "dev",
      startDate: isoDate("2027-03-01"),
      initialPrincipal: money("3400000"),
      fixationYears: 5,
      interestRatePa: devBlock.interestRatePa,
      monthlyInstalment: money("18000"),
    };
    const blocks = [devBlock, successor];
    expect(drawdowns(blocks)).toHaveLength(1);
    const [dd] = drawdowns(blocks, isoDate("2027-02-01"));
    expect(dd!.tranches.map((t) => t.status)).toEqual([
      "drawn",
      "drawn",
      "cancelled",
    ]);
    expectKc(dd!.total, 3500000);
    expectKc(dd!.drawn, 3500000);
    // Once the successor is in force the replaced block shows no drawdown (review of
    // PR #302).
    expect(drawdowns(blocks, isoDate("2027-03-01"))).toEqual([]);
  });

  it("a development block without tranches has no drawdown", () => {
    const ioOnly: MortgageBlock = { ...devBlock, draws: undefined };
    expect(drawdowns([ioOnly])).toEqual([]);
  });

  it("a plain loan has no drawdown", () => {
    const plain = portfolio.mortgages.filter((b) => b.propertyId === "dubova");
    expect(drawdowns(plain)).toEqual([]);
  });
});
