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
  useAllProjections,
  usePropertyEngine,
} from "../useEngine";
import { usePortfolioStore } from "../portfolioStore";
import {
  portfolio,
  assumptions,
  PARITY,
} from "../../engine/__tests__/support/seed";
import { near, KC } from "../../engine/__tests__/support/tolerance";
import { isoDate, rate } from "../../engine";
import type { Scenario } from "../../engine";

vi.mock("../../lib/today", () => ({
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
    createdAt: isoDate("2026-06-07"),
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
});

describe("useAllProjections / usePropertyEngine", () => {
  it("lists every active property's projection plus the portfolio", () => {
    const withInactive = {
      ...portfolio,
      properties: portfolio.properties.map((p) =>
        p.id === "lipova" ? { ...p, active: false } : p,
      ),
    };
    act(() => usePortfolioStore.setState({ portfolio: withInactive }));
    const { result } = renderHook(() => useAllProjections());
    expect(result.current!.perProperty.map((p) => p.id)).toEqual([
      "javorova",
      "dubova",
    ]);
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

  it("returns null for no id or an unknown id", () => {
    expect(renderHook(() => usePropertyEngine(null)).result.current).toBeNull();
    expect(
      renderHook(() => usePropertyEngine("nope")).result.current,
    ).toBeNull();
  });
});
