// The store checks engine input rules before writing (UX-047).
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { isoDate, rate, mortgageBlock } from "../../engine";
import type { MortgageBlock } from "../../engine";
import { money } from "../../engine";
import { openSeeded } from "./support/openSeeded";

describe("portfolioStore checks engine input rules before writing (UX-047)", () => {
  const pf = () => usePortfolioStore.getState().portfolio!;
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
  });

  const plain = (over: Partial<MortgageBlock> = {}): MortgageBlock =>
    mortgageBlock({
      id: "m-check",
      propertyId: pf().properties[0].id,
      startDate: isoDate("2030-01-01"),
      initialPrincipal: money("2000000"),
      fixationYears: 5,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("20000"),
      ...over,
    });

  it("an instalment below the monthly interest is refused, nothing written", async () => {
    const before = pf().mortgages.length;
    const r = await usePortfolioStore
      .getState()
      .addMortgageBlock(plain({ monthlyInstalment: money("100") }));
    expect(r).toEqual({
      ok: false,
      error: {
        kind: "input",
        errors: [
          {
            code: "INSTALMENT_BELOW_INTEREST",
            entity: "mortgage",
            id: "m-check",
            field: "monthlyInstalment",
          },
        ],
      },
    });
    expect(pf().mortgages.length).toBe(before);
  });

  it("a zero rate with a zero instalment is refused (DR-018)", async () => {
    const r = await usePortfolioStore
      .getState()
      .addMortgageBlock(
        plain({ interestRatePa: rate("0"), monthlyInstalment: money("0") }),
      );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind === "input" && r.error.errors[0].code).toBe(
      "ZERO_RATE_ZERO_INSTALMENT",
    );
  });

  it("moving a loan onto another loan's start date reports it on the edited loan", async () => {
    const [first] = pf().mortgages;
    const mine = { propertyId: first.propertyId };
    expect(
      (await usePortfolioStore.getState().addMortgageBlock(plain(mine))).ok,
    ).toBe(true);
    const r = await usePortfolioStore
      .getState()
      .saveMortgageBlock({ ...plain(mine), startDate: first.startDate });
    expect(r.ok).toBe(false);
    if (r.ok || r.error.kind !== "input") throw new Error("expected input");
    expect(r.error.errors).toContainEqual({
      code: "DUPLICATE_BLOCK_START",
      entity: "mortgage",
      id: "m-check",
      field: "startDate",
    });
  });

  it("a lease ending before it starts is refused on the end date", async () => {
    const r = await usePortfolioStore.getState().addLease({
      id: "l-check",
      propertyId: pf().properties[0].id,
      startDate: isoDate("2030-01-01"),
      endDate: isoDate("2029-01-01"),
      monthlyRent: money("1000"),
    });
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "END_BEFORE_START", field: "endDate" }],
      },
    });
  });

  it("a holding-cost share above 100 % is refused (DR-127)", async () => {
    const h = pf().holdingCosts[0];
    const r = await usePortfolioStore
      .getState()
      .saveHoldingCost({ ...h, mgmtPctRent: rate("1.5") });
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "RATE_OUT_OF_RANGE", field: "mgmtPctRent" }],
      },
    });
  });

  it("assumptions with a zero horizon are refused, nothing written", async () => {
    const a = usePortfolioStore.getState().assumptions!;
    const r = await usePortfolioStore
      .getState()
      .saveAssumptions({ ...a, horizonYears: 0 });
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "HORIZON_NOT_POSITIVE", field: "horizonYears" }],
      },
    });
    expect(usePortfolioStore.getState().assumptions!.horizonYears).toBe(
      a.horizonYears,
    );
  });

  it("a problem in another row does not block an unrelated edit", async () => {
    const v = pf().valuations[0];
    const r = await usePortfolioStore
      .getState()
      .saveValuation({ ...v, marketValue: money("12345678") });
    expect(r.ok).toBe(true);
  });
});

describe("development-loan rules at save time (UX-047, was mortgageFieldErrors)", () => {
  const pf = () => usePortfolioStore.getState().portfolio!;
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
  });

  it("a draw on the loan start date is refused on the draws field (D-42)", async () => {
    const start = isoDate("2030-01-01");
    const r = await usePortfolioStore.getState().addMortgageBlock(
      mortgageBlock({
        id: "m-draw",
        propertyId: pf().properties[0].id,
        startDate: start,
        initialPrincipal: money("1000000"),
        fixationYears: 5,
        loanTermYears: 30,
        interestRatePa: rate("0.05"),
        monthlyInstalment: money("6000"),
        draws: [{ date: start, amount: money("500000") }],
      }),
    );
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "DRAW_BEFORE_START", field: "draws" }],
      },
    });
  });

  it("a draw after the loan's last-but-one payment date is refused (DR-074, ADR 0129)", async () => {
    const start = isoDate("2030-01-01");
    const r = await usePortfolioStore.getState().addMortgageBlock(
      mortgageBlock({
        id: "m-draw-late",
        propertyId: pf().properties[0].id,
        startDate: start,
        initialPrincipal: money("1000000"),
        fixationYears: 5,
        loanTermYears: 30,
        interestRatePa: rate("0.05"),
        monthlyInstalment: money("6000"),
        draws: [{ date: isoDate("2060-01-01"), amount: money("500000") }],
      }),
    );
    expect(r).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "DRAW_AFTER_SCHEDULE_END", field: "draws" }],
      },
    });
  });
});
