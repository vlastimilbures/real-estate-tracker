// @vitest-environment jsdom
//
// P7a (PLAN P7 Part 1.2): presentation-only state changes must never re-run the engine,
// and should not re-render page trees that do not show them. Engine calls are counted
// with spies on the real engine functions; page re-renders with a React <Profiler>
// around the Dashboard (onRender fires only when something inside it re-rendered).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Profiler } from "react";
import { act, render, renderHook } from "@testing-library/react";
import { useEngine, useAllProjections, usePropertyEngine } from "../useEngine";
import { usePortfolioStore } from "../portfolioStore";
import { useUiStore } from "../uiStore";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import * as engine from "../../engine";
import { Dashboard } from "../../ui/pages/Dashboard";

vi.mock("../../lib/today", () => ({
  todayUtc: () => new Date(Date.UTC(2026, 5, 7)), // == baseDate
}));

vi.mock("../../engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../engine")>();
  return {
    ...actual,
    portfolioProjection: vi.fn(actual.portfolioProjection),
    portfolioSnapshot: vi.fn(actual.portfolioSnapshot),
    portfolioKpis: vi.fn(actual.portfolioKpis),
    propertyProjection: vi.fn(actual.propertyProjection),
    propertySnapshot: vi.fn(actual.propertySnapshot),
    schedulesByProperty: vi.fn(actual.schedulesByProperty),
    portfolioOutputs: vi.fn(actual.portfolioOutputs),
    projectionAndKpis: vi.fn(actual.projectionAndKpis),
  };
});

const spies = [
  engine.portfolioProjection,
  engine.portfolioSnapshot,
  engine.portfolioKpis,
  engine.propertyProjection,
  engine.propertySnapshot,
  engine.schedulesByProperty,
  engine.portfolioOutputs,
  engine.projectionAndKpis,
] as unknown as ReturnType<typeof vi.fn>[];

const engineCalls = () => spies.reduce((n, s) => n + s.mock.calls.length, 0);
const resetSpies = () => spies.forEach((s) => s.mockClear());

/** Every presentation-only toggle the UI offers, applied through the store actions. */
const toggles: [string, () => void][] = [
  ["theme", () => useUiStore.getState().setTheme("dark")],
  ["language", () => useUiStore.getState().setLanguage("cs")],
  ["sidebar", () => useUiStore.getState().toggleSidebar()],
  ["mode", () => useUiStore.getState().setMode("real")],
  ["settings tab", () => useUiStore.getState().setSettingsTab("backup")],
  ["about", () => useUiStore.getState().openAbout()],
];

beforeEach(() => {
  act(() => {
    usePortfolioStore.setState({ portfolio, assumptions, status: "ready" });
    useUiStore.setState({
      route: "dashboard",
      theme: "light",
      language: "en",
      sidebarCollapsed: false,
      mode: "nominal",
      settingsTab: "assumptions",
      aboutOpen: false,
      asOf: null,
      dashboardPropertyIds: [],
    });
  });
});

describe("engine recompute", () => {
  it.each(toggles)("%s does not re-run the engine", (_name, toggle) => {
    const hooks = renderHook(() => ({
      all: useEngine(),
      projections: useAllProjections(),
      property: usePropertyEngine("javorova"),
    }));
    const before = hooks.result.current;
    resetSpies();
    act(toggle);
    hooks.rerender();
    expect(engineCalls()).toBe(0);
    expect(hooks.result.current.all).toBe(before.all);
    expect(hooks.result.current.projections).toBe(before.projections);
    expect(hooks.result.current.property).toBe(before.property);
  });

  it("an assumptions change re-runs each hook exactly once", () => {
    const hooks = renderHook(() => useEngine());
    resetSpies();
    act(() => usePortfolioStore.setState({ assumptions: { ...assumptions } }));
    hooks.rerender();
    // P9 (DR-042): useEngine runs the engine in one pass, which builds the snapshot,
    // projection and KPIs once each (equivalence pinned in engine outputs.test.ts).
    expect(engine.portfolioOutputs).toHaveBeenCalledTimes(1);
    expect(engineCalls()).toBe(1);
  });
});

describe("Dashboard re-renders per toggle (measurement for the P7a report)", () => {
  it("records commit counts and engine calls", () => {
    let commits = 0;
    const counts: Record<string, { commits: number; engine: number }> = {};
    render(
      <Profiler id="dashboard" onRender={() => commits++}>
        <Dashboard />
      </Profiler>,
    );
    for (const [name, toggle] of toggles) {
      commits = 0;
      resetSpies();
      act(toggle);
      counts[name] = { commits, engine: engineCalls() };
    }
    // Logged, not asserted, except the engine: the counts are the report's evidence.
    console.info("P7a dashboard re-render probe", JSON.stringify(counts));
    for (const c of Object.values(counts)) expect(c.engine).toBe(0);
  });
});
