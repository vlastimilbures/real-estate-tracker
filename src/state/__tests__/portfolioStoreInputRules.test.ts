// The portfolio store checks the engine's input rules before it writes: a refused write
// returns the rule on its field and writes nothing. Loans, leases, holding costs,
// assumptions and scenarios.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import {
  edate,
  isoDate,
  money,
  mortgageBlock,
  rate,
  type MortgageBlock,
} from "../../engine";
import { openSeeded } from "./support/openSeeded";

// The setup file (src/__tests__/setup/stores.ts) resets both stores before every test;
// this file sets no spy and keeps no module-level state of its own.

const store = () => usePortfolioStore.getState();
const pf = () => store().portfolio!;

// UX-047.
describe("engine input rules before a write", () => {
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

// UX-047 (was mortgageFieldErrors).
describe("development-loan rules at save time", () => {
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

// ADR 0226: the store refuses a tranche in the loan's last two payment months and a
// mortgage starting within a month of the one it replaces, on add and on save, naming
// the field (and the draw's index) before anything is written.
/** A 30-year development loan from 2030-01-01: payment 358 is due 2059-11-01. */
const devLoan = (draw: string): MortgageBlock =>
  mortgageBlock({
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
  });

/** The block that already exists on the first property (the seed's). */
const seedBlock = () =>
  pf().mortgages.find((m) => m.propertyId === pf().properties[0].id)!;

const successor = (start: string): MortgageBlock => ({
  ...seedBlock(),
  id: "m-next",
  startDate: isoDate(start),
});

// ADR 0226 §1.
describe("a tranche in the last two payment months", () => {
  beforeEach(async () => {
    await store().init(openSeeded);
  });

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

// ADR 0226 §2.
describe("a mortgage within a month of the one it replaces", () => {
  beforeEach(async () => {
    await store().init(openSeeded);
  });

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

// ADR 0128 (#114): the store applies the new assumption bounds, and the cross-field rules
// (reset rate + rate shock, inflation + inflation shock) both ways: a scenario save is
// refused when its shock breaks one, and an assumptions save is refused when it newly
// breaks a saved scenario, naming it.
describe("assumption saves and their bounds", () => {
  const shock = (deltaPa: string) => ({
    deltaPa: rate(deltaPa),
    durationYears: 3,
  });

  const storedResetRate = async () =>
    (
      await portfolioDb
        .get()!
        .select<{ post_fixation_reset_rate_pa: string }>(
          "SELECT post_fixation_reset_rate_pa FROM assumptions",
        )
    ).map((r) => r.post_fixation_reset_rate_pa);

  beforeEach(async () => {
    await store().init(openSeeded);
  });

  it("saveAssumptions persists changed assumptions", async () => {
    const a = usePortfolioStore.getState().assumptions!;
    const result = await usePortfolioStore
      .getState()
      .saveAssumptions({ ...a, horizonYears: 25 });
    expect(result.ok).toBe(true);
    expect(usePortfolioStore.getState().assumptions!.horizonYears).toBe(25);
  });

  it("refuses a reset rate outside 0–100 % and growth at −100 %", async () => {
    const a = store().assumptions!;
    expect(
      await store().saveAssumptions({
        ...a,
        postFixationResetRatePa: rate("-0.05"),
        inflationPa: rate("-1"),
      }),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [
          { code: "RATE_OUT_OF_RANGE", field: "postFixationResetRatePa" },
          { code: "GROWTH_OUT_OF_RANGE", field: "inflationPa" },
        ],
      },
    });
    expect(await storedResetRate()).toEqual(["0.045"]);
  });

  it("refuses a scenario whose rate shock takes the reset rate below 0", async () => {
    // Seed reset rate 4.5 %.
    expect(
      await store().addScenario({
        id: "s1",
        name: "Negative rate",
        overrides: { rateShock: shock("-0.10") },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        errors: [{ code: "SHOCKED_RATE_OUT_OF_RANGE", field: "rateShock" }],
      },
    });
    expect(store().scenarios).toEqual([]);
  });

  it("refuses an assumptions edit that newly breaks a saved scenario, naming it", async () => {
    expect(
      await store().addScenario({
        id: "s1",
        name: "Rate cut",
        overrides: { rateShock: shock("-0.04") },
      }),
    ).toEqual({ ok: true });
    const a = store().assumptions!;
    const result = await store().saveAssumptions({
      ...a,
      postFixationResetRatePa: rate("0.03"),
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        scenario: "Rate cut",
        errors: [{ code: "SHOCKED_RATE_OUT_OF_RANGE", field: "rateShock" }],
      },
    });
    expect(await storedResetRate()).toEqual(["0.045"]);
    // The same edit passes once the scenario no longer breaks the rule.
    await store().saveScenario({
      id: "s1",
      name: "Rate cut",
      overrides: { rateShock: shock("-0.02") },
    });
    expect(
      await store().saveAssumptions({
        ...a,
        postFixationResetRatePa: rate("0.03"),
      }),
    ).toEqual({ ok: true });
  });

  it("names the scenario an inflation edit newly breaks", async () => {
    await store().addScenario({
      id: "s1",
      name: "Deflation",
      overrides: { inflationShock: shock("-0.6") },
    });
    const a = store().assumptions!;
    expect(
      await store().saveAssumptions({ ...a, inflationPa: rate("-0.5") }),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "input",
        scenario: "Deflation",
        errors: [
          { code: "SHOCKED_INFLATION_OUT_OF_RANGE", field: "inflationShock" },
        ],
      },
    });
  });

  it("a scenario that already broke the rule does not block the edit", async () => {
    // Saved before this rule (or restored): its shock takes 4.5 % below 0 already.
    await portfolioDb
      .get()!
      .execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
        [
          "old",
          "Old",
          '{"version":1,"rateShock":{"deltaPa":"-0.05","durationYears":3}}',
          "2026-01-01T00:00:00.000Z",
        ],
      );
    await store().refresh();
    const a = store().assumptions!;
    expect(
      await store().saveAssumptions({
        ...a,
        postFixationResetRatePa: rate("0.03"),
      }),
    ).toEqual({ ok: true });
    expect(await storedResetRate()).toEqual(["0.03"]);
  });
});

// ADR 0123 (#108): a scenario write runs the engine's assumption rules on the scenario's
// own overrides before anything is written, like saveAssumptions (UX-047).
describe("a scenario that breaks an engine rule", () => {
  const storedIds = async () =>
    (
      await portfolioDb
        .get()!
        .select<{ id: string }>("SELECT id FROM scenarios ORDER BY id")
    ).map((r) => r.id);

  it.each([
    [
      "a vacancy of 150 %",
      { vacancyAllowance: rate("1.5") },
      "RATE_OUT_OF_RANGE",
      "vacancyAllowance",
    ],
    [
      "a crash typed as −20 %",
      { valueShock: { pct: rate("-0.2"), atYear: 0 } },
      "SHOCK_OUT_OF_RANGE",
      "valueShock",
    ],
  ] as const)(
    "add and save refuse %s, nothing written",
    async (_, overrides, code, field) => {
      await usePortfolioStore.getState().init(openSeeded);
      const refused = {
        ok: false,
        error: { kind: "input", errors: [{ code, field }] },
      };
      const store = () => usePortfolioStore.getState();
      expect(
        await store().addScenario({ id: "bad", name: "Bad", overrides }),
      ).toMatchObject(refused);
      expect(await storedIds()).toEqual([]);

      await store().addScenario({ id: "s1", name: "Fine", overrides: {} });
      expect(
        await store().saveScenario({ id: "s1", name: "Fine", overrides }),
      ).toMatchObject(refused);
      expect(
        await portfolioDb.get()!.select("SELECT overrides FROM scenarios"),
      ).toEqual([{ overrides: '{"version":1}' }]);
    },
  );

  it("refuses to duplicate a stored scenario that breaks a rule", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    await portfolioDb
      .get()!
      .execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
        [
          "old",
          "Old",
          '{"version":1,"vacancyAllowance":"1.5"}',
          "2026-01-01T00:00:00.000Z",
        ],
      );
    await usePortfolioStore.getState().refresh();
    const r = await usePortfolioStore
      .getState()
      .duplicateScenario("old", "copy", "Old (copy)");
    expect(r).toMatchObject({
      ok: false,
      error: { kind: "input", errors: [{ code: "RATE_OUT_OF_RANGE" }] },
    });
    expect(await storedIds()).toEqual(["old"]);
  });
});
