// The store's pre-write rules without a store or a database (#465): each takes the state
// it checks against and throws before anything is written.
import { describe, expect, it } from "vitest";
import {
  EngineInputError,
  isoDate,
  money,
  rate,
  type Lease,
  type MortgageBlock,
  type Portfolio,
  type Scenario,
  mortgageBlock,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { RangeRuleError, ScenarioRuleError } from "../../writeError";
import { checkAssumptions, checkEdit, checkScenario, withRow } from "../rules";

const lease = (id: string, start: string, end?: string): Lease => ({
  id,
  propertyId: "javorova",
  startDate: isoDate(start),
  ...(end !== undefined && { endDate: isoDate(end) }),
  monthlyRent: money("20000"),
});
const withLeases = (leases: Lease[]): Portfolio => ({ ...portfolio, leases });
const leasesWith =
  (...rows: Lease[]) =>
  (p: Portfolio): Portfolio => ({
    ...p,
    leases: rows.reduce((ls, l) => withRow(ls, l), p.leases),
  });

/** What `run` threw, or undefined. */
function thrown(run: () => void): unknown {
  try {
    run();
  } catch (e) {
    return e;
  }
  return undefined;
}

const ids = (e: unknown) =>
  e instanceof EngineInputError ? e.errors.map((x) => x.id) : [];

describe("checkEdit", () => {
  it("refuses the edited row's rule and ignores a stored problem elsewhere", () => {
    const stored = withLeases([
      ...portfolio.leases,
      lease("l-broken", "2027-05-01", "2027-01-01"),
    ]);
    expect(
      thrown(() =>
        checkEdit(
          stored,
          (p) => ({
            ...p,
            valuations: withRow(p.valuations, {
              ...p.valuations[0]!,
              marketValue: money("10300000"),
            }),
          }),
          ["v-javorova"],
        ),
      ),
    ).toBeUndefined();
    const e = thrown(() =>
      checkEdit(
        stored,
        leasesWith(lease("l-new", "2030-05-01", "2030-01-01")),
        ["l-new"],
      ),
    );
    expect(e).toBeInstanceOf(EngineInputError);
    // Every error is on the edited row: none on l-broken.
    expect(new Set(ids(e))).toEqual(new Set(["l-new"]));
  });

  it("checks nothing before a portfolio is loaded", () =>
    expect(
      thrown(() => checkEdit(null, () => portfolio, ["l-javorova"])),
    ).toBeUndefined());

  it("overlapIds narrows the overlap rule to the rows that can add one (ADR 0163 §4)", () => {
    // l-javorova (open-ended) already overlaps l-old; ending it only shortens it.
    const stored = withLeases([
      ...portfolio.leases,
      lease("l-old", "2026-01-01", "2026-03-31"),
    ]);
    const edit = leasesWith(
      { ...portfolio.leases[0]!, endDate: isoDate("2029-12-31") },
      lease("l-next", "2030-01-01"),
    );
    expect(
      thrown(() =>
        checkEdit(stored, edit, ["l-next", "l-javorova"], ["l-next"]),
      ),
    ).toBeUndefined();
    const e = thrown(() => checkEdit(stored, edit, ["l-next", "l-javorova"]));
    expect(e).toBeInstanceOf(EngineInputError);
    expect(ids(e)).toContain("l-javorova");
  });

  it("reports an engine rule before a range (ADR 0245)", () => {
    const block =
      (over: Partial<MortgageBlock>) =>
      (p: Portfolio): Portfolio => ({
        ...p,
        mortgages: withRow(
          p.mortgages,
          mortgageBlock({
            ...p.mortgages[0]!,
            ...over,
          }),
        ),
      });
    const both = thrown(() =>
      checkEdit(
        portfolio,
        block({ fixationYears: 60, monthlyInstalment: money("0") }),
        ["m-javorova"],
      ),
    );
    expect(both).toBeInstanceOf(EngineInputError);
    expect(both).not.toBeInstanceOf(RangeRuleError);
    expect(ids(both)).toEqual(["m-javorova"]);

    const range = thrown(() =>
      checkEdit(portfolio, block({ fixationYears: 60 }), ["m-javorova"]),
    );
    expect(range).toBeInstanceOf(RangeRuleError);
    expect((range as RangeRuleError).ranges).toMatchObject([
      { entity: "mortgage", id: "m-javorova", field: "fixationYears" },
    ]);
  });
});

describe("checkAssumptions", () => {
  const state = (scenarios: Scenario[] = []) => ({
    portfolio,
    assumptions,
    scenarios,
  });

  it("refuses a horizon it moves out of range, not one already stored there", () => {
    const e = thrown(() =>
      checkAssumptions(state(), { ...assumptions, horizonYears: 150 }),
    );
    expect(e).toBeInstanceOf(RangeRuleError);
    expect((e as RangeRuleError).ranges).toMatchObject([
      { entity: "assumptions", field: "horizonYears", value: 150 },
    ]);
    const stored = {
      ...state(),
      assumptions: { ...assumptions, horizonYears: 150 },
    };
    expect(
      thrown(() =>
        checkAssumptions(stored, { ...assumptions, horizonYears: 150 }),
      ),
    ).toBeUndefined();
  });

  it("names the first saved scenario the edit newly breaks (ADR 0128 §6)", () => {
    const shocked = (id: string, name: string): Scenario => ({
      id,
      name,
      overrides: { rateShock: { deltaPa: rate("0.5"), durationYears: 5 } },
    });
    const s = state([
      { id: "s1", name: "Calm", overrides: {} },
      shocked("s2", "First"),
      shocked("s3", "Second"),
    ]);
    const e = thrown(() =>
      checkAssumptions(s, {
        ...assumptions,
        postFixationResetRatePa: rate("0.6"),
      }),
    );
    expect(e).toBeInstanceOf(ScenarioRuleError);
    expect((e as ScenarioRuleError).scenario).toBe("First");
    expect(
      thrown(() =>
        checkAssumptions(s, { ...assumptions, appreciationPa: rate("0.05") }),
      ),
    ).toBeUndefined();
  });
});

describe("checkScenario", () => {
  const late: Scenario = {
    id: "src",
    name: "Late crash",
    overrides: { valueShock: { pct: rate("0.2"), atYear: 150 } },
  };
  const state = { portfolio, assumptions, scenarios: [late] };

  it("compares a duplicate with its source (ADR 0257)", () => {
    const copy = { ...late, id: "copy", name: "Late crash (copy)" };
    expect(thrown(() => checkScenario(state, copy, late))).toBeUndefined();
    // By default the scenario stored under the copy's id: none, so the year is added.
    const e = thrown(() => checkScenario(state, copy));
    expect(e).toBeInstanceOf(RangeRuleError);
    expect((e as RangeRuleError).ranges).toMatchObject([
      { entity: "scenario", field: "valueShockYear", value: 150 },
    ]);
    // A save of the stored scenario keeps its stored year.
    expect(thrown(() => checkScenario(state, late))).toBeUndefined();
  });

  it("refuses an override that breaks an engine rule", () => {
    const e = thrown(() =>
      checkScenario(state, {
        id: "bad",
        name: "Bad",
        overrides: { vacancyAllowance: rate("1.5") },
      }),
    );
    expect(e).toBeInstanceOf(EngineInputError);
    expect((e as EngineInputError).errors).toMatchObject([
      { code: "RATE_OUT_OF_RANGE", field: "vacancyAllowance" },
    ]);
  });
});

describe("withRow", () => {
  it("replaces the row with the same id and moves it to the end", () => {
    const rows = [
      { id: "a", v: 1 },
      { id: "b", v: 2 },
      { id: "c", v: 3 },
    ];
    expect(withRow(rows, { id: "a", v: 9 })).toEqual([
      { id: "b", v: 2 },
      { id: "c", v: 3 },
      { id: "a", v: 9 },
    ]);
    expect(withRow(rows, { id: "d", v: 4 }).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});
