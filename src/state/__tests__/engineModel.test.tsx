// @vitest-environment jsdom
//
// #469: every engine hook reads one shared model per (portfolio, assumptions), so a page
// that needs several views builds each loan schedule once, and a revisit with unchanged
// data builds none. Counted on the schedule builder itself (`propertySchedules` in
// engine/loan/chain, mocked below), so a build anywhere in the engine counts; the
// public API re-exports that same mocked builder.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  EngineInputError,
  isoDate,
  money,
  propertySchedules,
} from "../../engine";
import type { Assumptions, Portfolio } from "../../engine";
import { usePortfolioStore } from "../portfolioStore";
import { useEngine, usePropertyEngineResult } from "../useEngine";
import { getEngineModel } from "../engineModel";
import { Properties } from "../../ui/pages/Properties";
import { Dashboard } from "../../ui/pages/Dashboard";
import { PropertyDetail } from "../../ui/pages/PropertyDetail";
import { Projections } from "../../ui/pages/Projections";
import { renderWithPortfolio } from "../../__tests__/support/world";
import { setClock } from "../../__tests__/support/clock";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { useUiStore } from "../uiStore";

vi.mock("../../engine/loan/chain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../engine/loan/chain")>();
  return { ...actual, propertySchedules: vi.fn(actual.propertySchedules) };
});

const builds = vi.mocked(propertySchedules);
/** Schedule builds since the last call. */
function counted(): number {
  const n = builds.mock.calls.length;
  builds.mockClear();
  return n;
}

beforeEach(() => {
  setClock("2026-06-07"); // == baseDate
});

/** A fresh data version, as the store's read-back after a write gives. */
const fresh = (): { portfolio: Portfolio; assumptions: Assumptions } => ({
  portfolio: { ...portfolio },
  assumptions: { ...assumptions },
});

describe("schedule builds per page (#469)", () => {
  it("Properties builds the schedules once per data change, none on a revisit", () => {
    const data = fresh();
    counted();
    const first = renderWithPortfolio(<Properties />, {
      ...data,
      route: "properties",
    });
    expect(counted()).toBe(1);
    first.unmount();
    renderWithPortfolio(<Properties />, {
      ...data,
      route: "properties",
    }).unmount();
    expect(counted()).toBe(0);
    const next = fresh();
    renderWithPortfolio(<Properties />, { ...next, route: "properties" });
    expect(counted()).toBe(1);
  });

  it("Dashboard → Properties → Dashboard builds the schedules once", () => {
    const data = fresh();
    counted();
    renderWithPortfolio(<Dashboard />, {
      ...data,
      route: "dashboard",
    }).unmount();
    renderWithPortfolio(<Properties />, {
      ...data,
      route: "properties",
    }).unmount();
    renderWithPortfolio(<Dashboard />, {
      ...data,
      route: "dashboard",
    }).unmount();
    expect(counted()).toBe(1);
  });

  it("Projections and a property's detail reuse the schedules Properties built", () => {
    const data = fresh();
    counted();
    renderWithPortfolio(<Properties />, {
      ...data,
      route: "properties",
    }).unmount();
    expect(counted()).toBe(1);
    renderWithPortfolio(<Projections />, {
      ...data,
      route: "projections",
    }).unmount();
    act(() => useUiStore.getState().openProperty("javorova"));
    renderWithPortfolio(<PropertyDetail />, { ...data }).unmount();
    expect(counted()).toBe(0);
  });

  it("a new as-of date builds no schedule", () => {
    const data = fresh();
    act(() => usePortfolioStore.setState(data));
    counted();
    const { rerender, result } = renderHook(
      ({ asOf }) => useEngine(null, asOf),
      {
        initialProps: { asOf: isoDate("2027-01-01") },
      },
    );
    expect(counted()).toBe(1);
    const first = result.current;
    rerender({ asOf: isoDate("2030-01-01") });
    expect(result.current).not.toBe(first);
    expect(counted()).toBe(0);
  });
});

describe("the engine model", () => {
  it("is one per portfolio and assumptions object", () => {
    const data = fresh();
    const model = getEngineModel(data.portfolio, data.assumptions);
    expect(getEngineModel(data.portfolio, data.assumptions)).toBe(model);
    expect(getEngineModel({ ...data.portfolio }, data.assumptions)).not.toBe(
      model,
    );
    expect(getEngineModel(data.portfolio, { ...data.assumptions })).not.toBe(
      model,
    );
  });

  it("a filtered view builds only the kept properties' schedules", () => {
    const data = fresh();
    counted();
    const model = getEngineModel(data.portfolio, data.assumptions);
    model.outputs(["lipova"], data.assumptions.baseDate);
    expect(builds.mock.calls.map((c) => c[1])).toEqual([["lipova"]]);
    counted();
    model.outputs([], data.assumptions.baseDate);
    expect(builds.mock.calls.map((c) => c[1])).toEqual([
      ["javorova", "dubova"],
    ]);
  });

  it("a filtered view is not broken by a property it leaves out", () => {
    const bad: Portfolio = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.propertyId === "javorova"
          ? { ...m, monthlyInstalment: money("1") }
          : m,
      ),
    };
    const model = getEngineModel(bad, assumptions);
    expect(() => model.outputs([], assumptions.baseDate)).toThrow(
      EngineInputError,
    );
    expect(
      model.outputs(["lipova"], assumptions.baseDate).portfolio.properties,
    ).toHaveLength(1);
  });

  it("keeps no throw: the next read throws again", () => {
    const bad: Portfolio = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m, i) =>
        i === 0 ? { ...m, monthlyInstalment: money("1") } : m,
      ),
    };
    const model = getEngineModel(bad, assumptions);
    expect(() => model.outputs([], assumptions.baseDate)).toThrow(
      EngineInputError,
    );
    expect(() => model.outputs([], assumptions.baseDate)).toThrow(
      EngineInputError,
    );
    expect(() => model.projections()).toThrow(EngineInputError);
    expect(() => model.projections()).toThrow(EngineInputError);
  });

  it("checks the assumptions on an empty portfolio every time they are read", () => {
    const empty: Portfolio = {
      properties: [],
      mortgages: [],
      valuations: [],
      leases: [],
      holdingCosts: [],
    };
    const bad = { ...assumptions, horizonYears: 0 };
    const model = getEngineModel(empty, bad);
    expect(() => model.outputs([], bad.baseDate)).toThrow(EngineInputError);
    expect(() => model.outputs([], bad.baseDate)).toThrow(EngineInputError);
  });

  it("keeps a property's input error, as the detail page shows it", () => {
    const bad: Portfolio = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.propertyId === "javorova"
          ? { ...m, monthlyInstalment: money("1") }
          : m,
      ),
    };
    act(() => usePortfolioStore.setState({ portfolio: bad, assumptions }));
    const { result, rerender } = renderHook(() =>
      usePropertyEngineResult("javorova", assumptions.baseDate),
    );
    const first = result.current;
    expect(first && "invalid" in first).toBe(true);
    rerender();
    expect(result.current).toBe(first);
  });

  it("keeps 16 as-of dates; an older one is computed again", () => {
    const data = fresh();
    const model = getEngineModel(data.portfolio, data.assumptions);
    const day = (d: number) => isoDate(`2027-01-${String(d).padStart(2, "0")}`);
    const first = model.outputs([], day(1));
    for (let d = 2; d <= 16; d++) model.outputs([], day(d));
    expect(model.outputs([], day(1))).toBe(first);
    model.outputs([], day(17));
    model.outputs([], day(18));
    const again = model.outputs([], day(1));
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });
});
