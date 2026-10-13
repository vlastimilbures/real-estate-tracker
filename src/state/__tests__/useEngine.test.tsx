// @vitest-environment jsdom
//
// P3 (DR-007): the single recompute path. Pins what each hook returns and — the part
// that matters for correctness and speed — when its memo recomputes and when it reuses
// the previous result.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useEngine,
  useScenarioComparison,
  useProjections,
  usePropertyEngine,
} from "../useEngine";
import { usePortfolioStore } from "../portfolioStore";
import {
  portfolio,
  assumptions,
  PARITY,
  withPropertyId,
} from "../../engine/__tests__/support/seed";
import { near, KC } from "../../engine/__tests__/support/tolerance";
import { EngineInputError, isoDate, money, rate } from "../../engine";
import type { Scenario } from "../../engine";

vi.mock("../../lib/day", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/day")>()),
  todayUtc: () => new Date(Date.UTC(2026, 5, 7)), // == baseDate
}));

const BASE = assumptions.baseDate;

beforeEach(() => {
  act(() => usePortfolioStore.setState({ portfolio, assumptions }));
});

describe("useEngine", () => {
  it("returns null until the store has loaded", () => {
    act(() => usePortfolioStore.setState({ portfolio: null }));
    const { result } = renderHook(() => useEngine());
    expect(result.current).toBeNull();
  });

  it("computes the parity snapshot and KPIs for the whole portfolio", () => {
    const { result } = renderHook(() => useEngine(null, BASE));
    const out = result.current!;
    near(out.snapshot.totalDebt, PARITY.snapshot.totalDebt, KC, "debt");
    near(out.kpis.netWorthNominal, PARITY.kpis.netWorthNominal, KC, "nw");
    expect(out.projection).toHaveLength(assumptions.horizonYears + 1);
    expect([...out.schedules.keys()].sort()).toEqual([
      "dubova",
      "javorova",
      "lipova",
    ]);
  });

  it("defaults asOf to today (resolved at the UI boundary)", () => {
    const { result } = renderHook(() => useEngine());
    expect(result.current!.snapshot.asOf.getTime()).toBe(BASE.getTime());
  });

  it("clamps an as-of date before baseDate to baseDate (D-19)", () => {
    const { result } = renderHook(() => useEngine(null, isoDate("2024-06-07")));
    const out = result.current!;
    expect(out.snapshot.asOf.getTime()).toBe(BASE.getTime());
    near(out.snapshot.totalDebt, PARITY.snapshot.totalDebt, KC, "debt");
  });

  it("filters properties but keeps the other arrays whole", () => {
    const { result } = renderHook(() => useEngine(["lipova"], BASE));
    const out = result.current!;
    expect(out.portfolio.properties.map((p) => p.id)).toEqual(["lipova"]);
    expect(out.portfolio.mortgages).toBe(portfolio.mortgages);
    near(out.snapshot.totalValue, PARITY.perProperty.lipova.value, KC, "v");
  });

  describe("memo keys", () => {
    it("reuses the result for a new-but-equal id array, in any order", () => {
      const { result, rerender } = renderHook(
        ({ ids }) => useEngine(ids, BASE),
        { initialProps: { ids: ["lipova", "javorova"] } },
      );
      const first = result.current;
      rerender({ ids: ["javorova", "lipova"] });
      expect(result.current).toBe(first);
      rerender({ ids: ["lipova"] });
      expect(result.current).not.toBe(first);
    });

    it("treats [] like no filter", () => {
      const { result, rerender } = renderHook(
        ({ ids }: { ids: string[] | null }) => useEngine(ids, BASE),
        { initialProps: { ids: null as string[] | null } },
      );
      const first = result.current;
      rerender({ ids: [] });
      expect(result.current).toBe(first);
    });

    it('filters to a property stored with the id "" (ADR 0127)', () => {
      act(() =>
        usePortfolioStore.setState({
          portfolio: withPropertyId("lipova", ""),
        }),
      );
      const { result, rerender } = renderHook(
        ({ ids }) => useEngine(ids, BASE),
        { initialProps: { ids: [] as string[] } },
      );
      expect(result.current!.portfolio.properties).toHaveLength(3);
      rerender({ ids: [""] });
      expect(result.current!.portfolio.properties.map((p) => p.id)).toEqual([
        "",
      ]);
    });

    it("keys asOf by time value: an equal new Date reuses, a new day recomputes", () => {
      const { result, rerender } = renderHook(
        ({ asOf }) => useEngine(null, asOf),
        { initialProps: { asOf: isoDate("2027-01-01") } },
      );
      const first = result.current;
      rerender({ asOf: isoDate("2027-01-01") });
      expect(result.current).toBe(first);
      rerender({ asOf: isoDate("2027-01-02") });
      expect(result.current).not.toBe(first);
    });

    it("recomputes when the store replaces portfolio or assumptions", () => {
      const { result } = renderHook(() => useEngine(null, BASE));
      const first = result.current;
      act(() => usePortfolioStore.setState({ portfolio: { ...portfolio } }));
      const second = result.current;
      expect(second).not.toBe(first);
      act(() =>
        usePortfolioStore.setState({ assumptions: { ...assumptions } }),
      );
      expect(result.current).not.toBe(second);
    });
  });
});

describe("useScenarioComparison", () => {
  const scenario = (name: string, appreciation: string): Scenario => ({
    id: "s1",
    name,
    overrides: { appreciationPa: rate(appreciation) },
  });

  it("runs one engine pass per scenario, in order", () => {
    const base: Scenario = {
      ...scenario("Base", "0.04"),
      id: "b",
      overrides: {},
    };
    const { result } = renderHook(() =>
      useScenarioComparison([base, scenario("Low", "0.01")]),
    );
    const [b, low] = result.current!;
    expect([b.id, low.id]).toEqual(["b", "s1"]);
    near(b.kpis.netWorthNominal, PARITY.kpis.netWorthNominal, KC, "base");
    expect(low.kpis.netWorthNominal.lt(b.kpis.netWorthNominal)).toBe(true);
  });

  it("reuses the result for equal content and recomputes when overrides change", () => {
    const { result, rerender } = renderHook(
      ({ s }) => useScenarioComparison([s]),
      { initialProps: { s: scenario("Low", "0.01") } },
    );
    const first = result.current;
    rerender({ s: scenario("Low", "0.01") });
    expect(result.current).toBe(first);
    rerender({ s: scenario("Low", "0.02") });
    expect(result.current).not.toBe(first);
  });

  // #147: the memo key must cover every override field, shock sub-fields included. The
  // Record type makes a new ScenarioOverrides field a compile error here until listed.
  const full: Scenario["overrides"] = {
    appreciationPa: rate("0.01"),
    rentIndexationPa: rate("0.02"),
    vacancyAllowance: rate("0.05"),
    postFixationResetRatePa: rate("0.05"),
    inflationPa: rate("0.03"),
    inflationShock: { deltaPa: rate("0.02"), durationYears: 2 },
    rateShock: { deltaPa: rate("0.01"), durationYears: 2 },
    valueShock: { pct: rate("0.1"), atYear: 1 },
  };
  const edits: Record<
    keyof Scenario["overrides"],
    Partial<Scenario["overrides"]>[]
  > = {
    appreciationPa: [{ appreciationPa: rate("0.015") }],
    rentIndexationPa: [{ rentIndexationPa: rate("0.025") }],
    vacancyAllowance: [{ vacancyAllowance: rate("0.06") }],
    postFixationResetRatePa: [{ postFixationResetRatePa: rate("0.06") }],
    inflationPa: [{ inflationPa: rate("0.035") }],
    inflationShock: [
      { inflationShock: { deltaPa: rate("0.03"), durationYears: 2 } },
      { inflationShock: { deltaPa: rate("0.02"), durationYears: 3 } },
    ],
    rateShock: [
      { rateShock: { deltaPa: rate("0.02"), durationYears: 2 } },
      { rateShock: { deltaPa: rate("0.01"), durationYears: 3 } },
    ],
    valueShock: [
      { valueShock: { pct: rate("0.2"), atYear: 1 } },
      { valueShock: { pct: rate("0.1"), atYear: 2 } },
    ],
  };
  it.each(
    Object.entries(edits).flatMap(([field, list]) =>
      list.map((edit, i) => [`${field} #${i + 1}`, edit] as const),
    ),
  )("recomputes when %s changes", (_, edit) => {
    const at = (overrides: Scenario["overrides"]): Scenario => ({
      id: "s1",
      name: "All",
      overrides,
    });
    const { result, rerender } = renderHook(
      ({ s }) => useScenarioComparison([s]),
      { initialProps: { s: at(full) } },
    );
    const first = result.current;
    rerender({ s: at({ ...full }) });
    expect(result.current).toBe(first);
    rerender({ s: at({ ...full, ...edit }) });
    expect(result.current).not.toBe(first);
  });

  it("a rename returns the new name (UX-051, DR-055)", () => {
    const { result, rerender } = renderHook(
      ({ s }) => useScenarioComparison([s]),
      { initialProps: { s: scenario("Low", "0.01") } },
    );
    const before = result.current![0].projection;
    rerender({ s: scenario("Renamed", "0.01") });
    expect(result.current![0].name).toBe("Renamed");
    // The engine did not re-run for a rename: same projection object.
    expect(result.current![0].projection).toBe(before);
  });

  // ADR 0123 (#108): a scenario whose own overrides break an engine rule is left out
  // (the page names it) instead of throwing during render.
  it("leaves out a scenario that breaks a rule and keeps every name on its own row", () => {
    const base: Scenario = { id: "b", name: "Base", overrides: {} };
    const bad: Scenario = {
      id: "bad",
      name: "Crash typed as −20 %",
      overrides: { valueShock: { pct: rate("-0.2"), atYear: 0 } },
    };
    const { result } = renderHook(() =>
      useScenarioComparison([base, bad, scenario("Low", "0.01")]),
    );
    expect(result.current!.map((r) => [r.id, r.name])).toEqual([
      ["b", "Base"],
      ["s1", "Low"],
    ]);
  });

  it("still throws on invalid portfolio data (DR-146 notice)", () => {
    const [v0, ...vs] = portfolio.valuations;
    act(() =>
      usePortfolioStore.setState({
        portfolio: {
          ...portfolio,
          valuations: [{ ...v0!, marketValue: money("-1") }, ...vs],
        },
      }),
    );
    // React logs the render error; keep the test output clean.
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      renderHook(() => useScenarioComparison([scenario("Low", "0.01")])),
    ).toThrow(EngineInputError);
    log.mockRestore();
  });
});

describe("useProjections / usePropertyEngine", () => {
  it("returns the portfolio and every property's projection, inactive included", () => {
    const withInactive = {
      ...portfolio,
      properties: portfolio.properties.map((p) =>
        p.id === "lipova" ? { ...p, active: false } : p,
      ),
    };
    act(() => usePortfolioStore.setState({ portfolio: withInactive }));
    const { result } = renderHook(() => useProjections());
    expect([...result.current!.byProperty.keys()]).toEqual(
      portfolio.properties.map((p) => p.id),
    );
    expect(result.current!.portfolio).toHaveLength(
      assumptions.horizonYears + 1,
    );
  });

  it("returns one property's snapshot, projection and schedule", () => {
    const { result } = renderHook(() => usePropertyEngine("javorova", BASE));
    near(
      result.current!.snapshot.debt,
      PARITY.perProperty.javorova.debt,
      KC,
      "debt",
    );
    expect(result.current!.schedule.length).toBeGreaterThan(0);
  });

  it("carries the loan's event outcomes, modelled payoff and interest saved (ADR 0116)", () => {
    const plain = renderHook(() => usePropertyEngine("javorova", BASE)).result
      .current!;
    expect(plain.eventOutcomes).toEqual([]);
    expect(plain.financing?.loan.interestSaved).toBeNull();
    const payoff = plain.financing?.loan.payoffDate;
    expect(payoff).toBeTruthy();
    const withEvent = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.propertyId === "javorova"
          ? {
              ...m,
              prepayments: [
                {
                  date: isoDate("2031-01-17"),
                  amount: money(500000),
                  effect: "shortenTerm" as const,
                },
              ],
            }
          : m,
      ),
    };
    act(() => usePortfolioStore.setState({ portfolio: withEvent }));
    const out = renderHook(() => usePropertyEngine("javorova", BASE)).result
      .current!;
    expect(out.eventOutcomes).toHaveLength(1);
    expect(out.eventOutcomes[0]).toMatchObject({
      kind: "prepayment",
      issue: null,
    });
    expect(out.financing?.loan.interestSaved?.greaterThan(0)).toBe(true);
    expect(out.financing!.loan.payoffDate!.getTime()).toBeLessThan(
      payoff!.getTime(),
    );
  });

  it("carries the purchase's sources and uses (ADR 0119 §9)", () => {
    // Lipova's loan starts on its purchase day; Javorova's first block starts years later.
    const lipova = renderHook(() => usePropertyEngine("lipova", BASE)).result
      .current!;
    expect(lipova.acquisition.price.toString()).toBe("7225000");
    expect(lipova.acquisition.loan?.toString()).toBe("5610000");
    expect(lipova.acquisition.ownCash).toBeNull();
    const javorova = renderHook(() => usePropertyEngine("javorova", BASE))
      .result.current!;
    expect(javorova.acquisition.loan).toBeNull();
  });

  it("clamps an as-of date before baseDate to baseDate (D-19)", () => {
    const { result } = renderHook(() =>
      usePropertyEngine("javorova", isoDate("2024-06-07")),
    );
    near(
      result.current!.snapshot.debt,
      PARITY.perProperty.javorova.debt,
      KC,
      "debt",
    );
  });

  it('computes a property stored with the id "" (ADR 0127)', () => {
    act(() =>
      usePortfolioStore.setState({ portfolio: withPropertyId("javorova", "") }),
    );
    const { result } = renderHook(() => usePropertyEngine("", BASE));
    near(
      result.current!.snapshot.debt,
      PARITY.perProperty.javorova.debt,
      KC,
      "debt",
    );
  });

  // #174 item 6: the schedule, projection and acquisition do not depend on the as-of
  // date, so a new pick re-reads only the snapshot and the loan exposure.
  it("a new as-of date reuses the schedule, projection and acquisition", () => {
    const { result, rerender } = renderHook(
      ({ asOf }) => usePropertyEngine("javorova", asOf),
      { initialProps: { asOf: BASE } },
    );
    const first = result.current!;
    rerender({ asOf: isoDate("2030-01-01") });
    const next = result.current!;
    expect(next.snapshot).not.toBe(first.snapshot);
    expect(next.schedule).toBe(first.schedule);
    expect(next.projection).toBe(first.projection);
    expect(next.acquisition).toBe(first.acquisition);
    expect(next.eventOutcomes).toBe(first.eventOutcomes);
  });

  it("returns null for no id or an unknown id", () => {
    expect(renderHook(() => usePropertyEngine(null)).result.current).toBeNull();
    expect(
      renderHook(() => usePropertyEngine("nope")).result.current,
    ).toBeNull();
  });
});
