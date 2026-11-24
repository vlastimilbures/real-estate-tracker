// @vitest-environment jsdom
//
// #469: the scenario compare reads the shared engine model, so a revisit with unchanged
// data runs no scenario again, and a scenario already run (by content) is reused when the
// selection or a name changes. Counted on the engine's one-scenario pass.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { projectionAndKpis, rate } from "../../engine";
import type { Scenario } from "../../engine";
import { usePortfolioStore } from "../portfolioStore";
import { useScenarioComparison } from "../useEngine";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { setClock } from "../../__tests__/support/clock";

vi.mock("../../engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../engine")>();
  return { ...actual, projectionAndKpis: vi.fn(actual.projectionAndKpis) };
});

const runs = vi.mocked(projectionAndKpis);
/** Scenario runs since the last call. */
function counted(): number {
  const n = runs.mock.calls.length;
  runs.mockClear();
  return n;
}

const base: Scenario = { id: "b", name: "Base", overrides: {} };
const low = (name = "Low"): Scenario => ({
  id: "low",
  name,
  overrides: { appreciationPa: rate("0.01") },
});

beforeEach(() => {
  setClock("2026-06-07"); // == baseDate
  act(() =>
    usePortfolioStore.setState({
      portfolio: { ...portfolio },
      assumptions: { ...assumptions },
    }),
  );
  counted();
});

describe("scenario compare on the engine model (#469)", () => {
  it("a revisit with unchanged data runs no scenario again", () => {
    const first = renderHook(() => useScenarioComparison([base, low()]));
    expect(counted()).toBe(2);
    const before = first.result.current;
    first.unmount();
    const again = renderHook(() => useScenarioComparison([base, low()]));
    expect(counted()).toBe(0);
    expect(again.result.current).toBe(before);
  });

  it("a scenario already run is reused when the selection changes", () => {
    const { result, rerender } = renderHook(
      ({ list }) => useScenarioComparison(list),
      { initialProps: { list: [low()] } },
    );
    const lowRun = result.current![0]!.projection;
    expect(counted()).toBe(1);
    rerender({ list: [base, low()] });
    expect(counted()).toBe(1);
    expect(result.current![1]!.projection).toBe(lowRun);
  });

  it("a rename runs nothing and returns the new name", () => {
    const { result, rerender } = renderHook(
      ({ s }) => useScenarioComparison([s]),
      { initialProps: { s: low() } },
    );
    counted();
    rerender({ s: low("Renamed") });
    expect(counted()).toBe(0);
    expect(result.current!.map((r) => r.name)).toEqual(["Renamed"]);
  });

  it("a data change runs every scenario again", () => {
    renderHook(() => useScenarioComparison([base, low()]));
    counted();
    act(() => usePortfolioStore.setState({ portfolio: { ...portfolio } }));
    expect(counted()).toBe(2);
  });
});
