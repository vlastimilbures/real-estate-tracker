// @vitest-environment jsdom
//
// ADR 0190 (#166): a scenario's appreciation level does not reach a property with its own
// rate; the compare names it under the key-figures table.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  applyScenario,
  cpiIndex,
  portfolioKpis,
  portfolioProjection,
  rate,
  realProjection,
  type Scenario,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import type { CompareResult } from "../../model/compare";

const base: Scenario = { id: "base", name: "Base", overrides: {} };
const low: Scenario = {
  id: "low",
  name: "Low growth",
  overrides: { appreciationPa: rate("0") },
};

function result(s: Scenario): CompareResult {
  const assn = applyScenario(assumptions, s.overrides);
  const projection = portfolioProjection(portfolio, assn);
  return {
    id: s.id,
    name: s.name,
    projection,
    realProjection: realProjection(projection, cpiIndex(assn)),
    kpis: portfolioKpis(portfolio, assn),
  };
}

let results = [result(base), result(low)];
vi.mock("../../../state/useEngine", () => ({
  useScenarioComparison: () => results,
}));

const { CompareView } = await import("../ScenarioCompare");

beforeEach(() =>
  act(() => useUiStore.setState({ language: "en", mode: "nominal" })),
);

describe("Compare own-rate note (ADR 0190)", () => {
  it("names the properties with their own rate under the table", () => {
    const [first, ...rest] = portfolio.properties;
    const own = { ...first!, appreciationOverridePa: rate("0.01") };
    act(() =>
      usePortfolioStore.setState({
        portfolio: { ...portfolio, properties: [own, ...rest] },
      }),
    );
    const { container } = render(<CompareView selected={[base, low]} />);
    expect(
      screen.getByText(en.scenarios.levelNotApplied("Low growth", own.name)),
    ).toBe(container.querySelector(".ct-footnote"));
  });

  it("two scenarios with the same name each keep their line", () => {
    const [first, ...rest] = portfolio.properties;
    const own = { ...first!, appreciationOverridePa: rate("0.01") };
    act(() =>
      usePortfolioStore.setState({
        portfolio: { ...portfolio, properties: [own, ...rest] },
      }),
    );
    const twin = { ...low, id: "low-2" };
    results = [result(base), result(low), result(twin)];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<CompareView selected={[base, low, twin]} />);
    expect(
      screen.getAllByText(en.scenarios.levelNotApplied("Low growth", own.name)),
    ).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("no property with its own rate: no note", () => {
    act(() => usePortfolioStore.setState({ portfolio }));
    const { container } = render(<CompareView selected={[base, low]} />);
    expect(container.querySelector(".ct-footnote")).toBeNull();
  });
});
