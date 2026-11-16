// ADR 0226: the store refuses a tranche in the loan's last two payment months and a
// mortgage starting within a month of the one it replaces, on add and on save, naming
// the field (and the draw's index) before anything is written.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { edate, isoDate, money, rate, type MortgageBlock } from "../../engine";
import type { Sql } from "../../data/sql";

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

const store = () => usePortfolioStore.getState();
const pf = () => store().portfolio!;

/** A 30-year development loan from 2030-01-01: payment 358 is due 2059-11-01. */
const devLoan = (draw: string): MortgageBlock =>
  ({
    id: "m-late",
    propertyId: pf().properties[0].id,
    startDate: isoDate("2030-01-01"),
    initialPrincipal: money("1000000"),
    fixationYears: 5,
    loanTermYears: 30,
    interestRatePa: rate("0.05"),
    monthlyInstalment: money("6000"),
    draws: [
      { date: isoDate("2031-01-01"), amount: money("100000") },
      { date: isoDate(draw), amount: money("500000") },
    ],
  }) as MortgageBlock;

/** The block that already exists on the first property (the seed's). */
const seedBlock = () =>
  pf().mortgages.find((m) => m.propertyId === pf().properties[0].id)!;

const successor = (start: string): MortgageBlock => ({
  ...seedBlock(),
  id: "m-next",
  startDate: isoDate(start),
});

beforeEach(async () => {
  await store().init(openSeeded);
});

describe("ADR 0226 §1: a tranche in the last two payment months", () => {
  it("is refused on add, naming the draw", async () => {
    const r = await store().addMortgageBlock(devLoan("2059-12-01"));
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [
          { code: "DRAW_IN_LAST_TWO_PAYMENTS", field: "draws", index: 1 },
        ],
      },
    });
    expect(pf().mortgages.some((m) => m.id === "m-late")).toBe(false);
  });

  it("is refused on save; the last-but-two date is accepted", async () => {
    expect((await store().addMortgageBlock(devLoan("2059-11-01"))).ok).toBe(
      true,
    );
    const r = await store().saveMortgageBlock(devLoan("2059-11-02"));
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [
          { code: "DRAW_IN_LAST_TWO_PAYMENTS", field: "draws", index: 1 },
        ],
      },
    });
    const kept = pf().mortgages.find((m) => m.id === "m-late")!;
    expect(kept.draws?.[1]?.date).toEqual(isoDate("2059-11-01"));
  });
});

describe("ADR 0226 §2: a mortgage within a month of the one it replaces", () => {
  it("is refused on add, on the start date", async () => {
    // On EDATE(start, 1) itself: the last day still within the month.
    const r = await store().addMortgageBlock({
      ...successor("2000-01-01"),
      startDate: edate(seedBlock().startDate, 1),
    });
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "REFINANCE_WITHIN_A_MONTH", field: "startDate" }],
      },
    });
    expect(pf().mortgages.some((m) => m.id === "m-next")).toBe(false);
  });

  it("is refused on save when a start moves within the month", async () => {
    expect((await store().addMortgageBlock(successor("2032-06-01"))).ok).toBe(
      true,
    );
    const before = pf().mortgages.find((m) => m.id === "m-next")!;
    const moved = { ...before, startDate: isoDate("2032-06-01") };
    // A third block a month and a day later is accepted; moving it within the month is not.
    expect(
      (
        await store().addMortgageBlock({
          ...moved,
          id: "m-third",
          startDate: isoDate("2032-07-02"),
        })
      ).ok,
    ).toBe(true);
    const r = await store().saveMortgageBlock({
      ...moved,
      id: "m-third",
      startDate: isoDate("2032-07-01"),
    });
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "REFINANCE_WITHIN_A_MONTH", field: "startDate" }],
      },
    });
    expect(pf().mortgages.find((m) => m.id === "m-third")?.startDate).toEqual(
      isoDate("2032-07-02"),
    );
  });
});
