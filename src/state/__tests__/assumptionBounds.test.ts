// ADR 0128 (#114): the store applies the new assumption bounds, and the cross-field rules
// (reset rate + rate shock, inflation + inflation shock) both ways: a scenario save is
// refused when its shock breaks one, and an assumptions save is refused when it newly
// breaks a saved scenario, naming it.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { rate } from "../../engine";
import type { Sql } from "../../data/sql";

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

const store = () => usePortfolioStore.getState();

const shock = (deltaPa: string) => ({
  deltaPa: rate(deltaPa),
  durationYears: 3,
});

const storedResetRate = async () =>
  (
    await store().sql!.select<{ post_fixation_reset_rate_pa: string }>(
      "SELECT post_fixation_reset_rate_pa FROM assumptions",
    )
  ).map((r) => r.post_fixation_reset_rate_pa);

beforeEach(async () => {
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    assumptions: null,
    scenarios: [],
    status: "idle",
    error: null,
    startupError: null,
  });
  await store().init(openSeeded);
});

describe("assumption bounds at save time (ADR 0128)", () => {
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
    await store().sql!.execute(
      "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
      [
        "old",
        "Old",
        '{"version":1,"rateShock":{"deltaPa":"-0.05","durationYears":3}}',
        "2026-01-01T00:00:00.000Z",
      ],
    );
    await store().reload();
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
