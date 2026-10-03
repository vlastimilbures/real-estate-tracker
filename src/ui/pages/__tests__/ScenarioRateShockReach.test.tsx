// @vitest-environment jsdom
//
// ADR 0100 (#47): a rate-shock scenario says which loans its shock hits, in the list
// summary and as the compare column header's tooltip; the rate-shock help says where
// the shock starts.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  applyScenario,
  cpiIndex,
  portfolioKpis,
  portfolioProjection,
  rate,
  realProjection,
} from "../../../engine";
import type { Scenario, ScenarioOverrides } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { en } from "../../../i18n/en";
import type { CompareResult } from "../../model/compare";

function result(
  id: string,
  name: string,
  overrides: ScenarioOverrides = {},
): CompareResult {
  const assn = applyScenario(assumptions, overrides);
  const projection = portfolioProjection(portfolio, assn);
  return {
    id,
    name,
    projection,
    realProjection: realProjection(projection, cpiIndex(assn)),
    kpis: portfolioKpis(portfolio, assn),
  };
}

const shock: ScenarioOverrides = {
  rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
};
const rates: Scenario = {
  id: "rates",
  name: "Rates +2pp",
  overrides: shock,
  createdAt: assumptions.baseDate,
};
const results = [result("base", "Base"), result("rates", "Rates +2pp", shock)];

vi.mock("../../../state/useEngine", () => ({
  useScenarioComparison: () => results,
}));

const { Scenarios } = await import("../Scenarios");
const { ScenarioForm } = await import("../ScenarioForm");

const reach = "hits 3 of 3 loans (refix 2029, 2031)";

beforeEach(() => {
  window.scrollTo = vi.fn();
  act(() => {
    useUiStore.setState({ language: "en", mode: "nominal" });
    usePortfolioStore.setState({ portfolio, assumptions, scenarios: [rates] });
  });
});

describe("Rate shock reach (ADR 0100)", () => {
  it("the list summary names the loans the shock hits", () => {
    render(<Scenarios />);
    expect(
      screen.getByText(`rates +2,0 pp for 3y, ${reach}`, {
        selector: ".scenario-summary",
      }),
    ).toBeTruthy();
  });

  it("the compare column header carries the same note", () => {
    render(<Scenarios />);
    // The sr-only copy is part of the header's name.
    const header = screen.getByRole("columnheader", {
      name: (name) => name.startsWith("Rates +2pp") && name.includes(reach),
    });
    expect(header.getAttribute("title")).toBe(reach);
    const base = screen.getByRole("columnheader", { name: "Base" });
    expect(base.getAttribute("title")).toBeNull();
  });

  it("the rate shock help says it starts at each loan's fixation end", () => {
    render(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByText(en.scenarios.rateShockHelp)).toBeTruthy();
    expect(en.scenarios.rateShockHelp).toMatch(/each loan's fixation end/);
    expect(screen.getByText(en.scenarios.shockHelp)).toBeTruthy();
  });
});
