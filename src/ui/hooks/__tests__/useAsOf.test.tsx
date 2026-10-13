// @vitest-environment jsdom
//
// ADR 0150 (#265): the one as-of resolve step. Dashboard and Property detail follow the
// picked date; Properties shows Today (ADR 0111). Each gets the picker's window too.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAsOf } from "../useAsOf";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { asOfBounds } from "../../model/asOf";
import { addYears, isoDate } from "../../../engine";
import { assumptions } from "../../../engine/__tests__/support/seed";

vi.mock("../../../lib/day", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/day")>()),
  todayUtc: () => new Date(Date.UTC(2026, 9, 1)),
}));

const today = new Date(Date.UTC(2026, 9, 1));
const picked = addYears(assumptions.baseDate, 5);

beforeEach(() => {
  act(() => {
    usePortfolioStore.setState({ assumptions });
    useUiStore.setState({ asOf: picked });
  });
});

describe("useAsOf", () => {
  it("is null until the assumptions have loaded", () => {
    act(() => usePortfolioStore.setState({ assumptions: null }));
    expect(renderHook(() => useAsOf()).result.current).toBeNull();
  });

  it("follows the picked date and returns the picker's window", () => {
    const view = renderHook(() => useAsOf()).result.current!;
    expect(view.date).toEqual(picked);
    expect(view.isToday).toBe(false);
    expect(view.bounds).toEqual(
      asOfBounds(assumptions.baseDate, assumptions.horizonYears),
    );
  });

  it("without followPick resolves today, whatever is picked", () => {
    const view = renderHook(() => useAsOf({ followPick: false })).result
      .current!;
    expect(view.date).toEqual(today);
    expect(view.isToday).toBe(true);
  });

  it("clamps the pick into the window", () => {
    act(() => useUiStore.setState({ asOf: isoDate("2090-01-01") }));
    const view = renderHook(() => useAsOf()).result.current!;
    expect(view.date).toEqual(view.bounds.max);
  });
});
