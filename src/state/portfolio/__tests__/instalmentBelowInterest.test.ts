// ADR 0264 §2: the store refuses to add or save a plain loan with a term whose instalment
// is at or below its first month's interest, and writes nothing. A loan like that stored
// before the rule still loads; it blocks no write of another row, cannot be saved again
// until its instalment passes, and can be deleted (owner decision 2, #597).
import { beforeEach, describe, expect, it } from "vitest";
import {
  usePortfolioStore,
  type MutationResult,
  portfolioDb,
} from "../../portfolioStore";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import { insertMortgageBlock } from "../../../data/repositories";
import { isoDate, money, rate, type MortgageBlock } from "../../../engine";
import type { Sql } from "../../../data/sql";

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

const store = () => usePortfolioStore.getState();
const pf = () => store().portfolio!;

async function reset(open: () => Promise<Sql> = openSeeded) {
  portfolioDb.set(null);
  usePortfolioStore.setState({
    portfolio: null,
    assumptions: null,
    status: { kind: "idle" },
    error: null,
  });
  await store().init(open);
}

/** The input-rule errors of a refused write, as code and field. */
const inputErrors = (r: MutationResult) =>
  r.ok || r.error.kind !== "input"
    ? []
    : r.error.errors.map((e) => [e.code, e.field]);

/** A Dubova refinance: 3,000,000 Kč at 5 %, a 30-year term, instalment 1,000 Kč. Its
 *  first month's interest is 12,500 Kč. */
const below: MortgageBlock = {
  id: "m-below",
  propertyId: "dubova",
  startDate: isoDate("2027-03-12"),
  initialPrincipal: money("3000000"),
  fixationYears: 3,
  interestRatePa: rate("0.05"),
  monthlyInstalment: money("1000"),
  loanTermYears: 30,
};

beforeEach(() => reset());

describe("a new or edited loan below its first interest (ADR 0264)", () => {
  it("addMortgageBlock refuses it on the instalment and writes nothing", async () => {
    const before = JSON.stringify(pf().mortgages);
    expect(inputErrors(await store().addMortgageBlock(below))).toEqual([
      ["INSTALMENT_BELOW_INTEREST", "monthlyInstalment"],
    ]);
    expect(JSON.stringify(pf().mortgages)).toBe(before);
  });

  it("saveMortgageBlock refuses giving a stored loan a term with such an instalment", async () => {
    const javorova = pf().mortgages.find((m) => m.id === "m-javorova")!;
    const before = JSON.stringify(pf().mortgages);
    // 1,912,500 × 1.69 % ÷ 12 = 2,693.4375 Kč.
    const r = await store().saveMortgageBlock({
      ...javorova,
      loanTermYears: 30,
      monthlyInstalment: money("2693.43"),
    });
    expect(inputErrors(r)).toEqual([
      ["INSTALMENT_BELOW_INTEREST", "monthlyInstalment"],
    ]);
    expect(JSON.stringify(pf().mortgages)).toBe(before);
  });

  it("refuses a 0 % loan with a term and a 0 Kč instalment", async () => {
    const r = await store().addMortgageBlock({
      ...below,
      interestRatePa: rate("0"),
      monthlyInstalment: money("0"),
    });
    expect(inputErrors(r)).toEqual([
      ["ZERO_RATE_ZERO_INSTALMENT", "monthlyInstalment"],
    ]);
  });

  it("adds one 1 haléř above the first interest", async () => {
    expect(
      await store().addMortgageBlock({
        ...below,
        monthlyInstalment: money("12500.01"),
      }),
    ).toEqual({ ok: true });
  });
});

describe("a loan below its first interest stored before ADR 0264", () => {
  beforeEach(() =>
    reset(async () => {
      const sql = await openSeeded();
      await insertMortgageBlock(sql, below);
      return sql;
    }),
  );

  it("loads", () =>
    expect(pf().mortgages.some((m) => m.id === below.id)).toBe(true));

  it("does not block a valuation, a lease, a successor block or a property edit", async () => {
    expect(
      await store().addValuation({
        id: "v-dubova-2027",
        propertyId: "dubova",
        validFrom: isoDate("2027-06-01"),
        marketValue: money("9900000"),
      }),
    ).toEqual({ ok: true });
    expect(
      await store().addLease({
        id: "l-dubova-2028",
        propertyId: "dubova",
        startDate: isoDate("2028-01-01"),
        monthlyRent: money("23000"),
      }),
    ).toEqual({ ok: true });
    expect(
      await store().addMortgageBlock({
        ...below,
        id: "m-after",
        startDate: isoDate("2030-03-12"),
        initialPrincipal: money("2900000"),
        monthlyInstalment: money("16000"),
      }),
    ).toEqual({ ok: true });
    const dubova = pf().properties.find((p) => p.id === "dubova")!;
    const extras = await store().getPropertyExtras("dubova");
    expect(extras.ok).toBe(true);
    if (!extras.ok) return;
    expect(
      await store().editProperty(
        { ...dubova, name: "Byt Dubova 2" },
        extras.value,
      ),
    ).toEqual({ ok: true });
  });

  it("refuses to save it unchanged, saves it with a higher instalment", async () => {
    expect(inputErrors(await store().saveMortgageBlock(below))).toEqual([
      ["INSTALMENT_BELOW_INTEREST", "monthlyInstalment"],
    ]);
    expect(
      await store().saveMortgageBlock({
        ...below,
        monthlyInstalment: money("16200"),
      }),
    ).toEqual({ ok: true });
  });

  it("deletes it", async () => {
    expect(await store().removeMortgageBlock(below.id)).toEqual({ ok: true });
    expect(pf().mortgages.some((m) => m.id === below.id)).toBe(false);
  });
});
