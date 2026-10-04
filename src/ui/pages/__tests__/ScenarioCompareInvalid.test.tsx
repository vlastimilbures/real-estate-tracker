// @vitest-environment jsdom
//
// ADR 0123 (#108): a saved scenario whose overrides break an engine rule (from before
// the store checked them) is left out of the compare and named above it. The page
// keeps working; before, the throw replaced the whole Scenarios page (probe R4-02A-1).
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CompareView } from "../ScenarioCompare";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { rate, type Scenario } from "../../../engine";
import { en } from "../../../i18n/en";

const base: Scenario = { id: "base", name: "Base", overrides: {} };
const crash: Scenario = {
  id: "crash",
  name: "Crash −20 %",
  overrides: { valueShock: { pct: rate("-0.2"), atYear: 0 } },
};
const vacancy: Scenario = {
  id: "vac",
  name: "Empty",
  overrides: { vacancyAllowance: rate("1.5") },
};

beforeEach(() =>
  act(() => {
    useUiStore.setState({ language: "en", mode: "nominal" });
    usePortfolioStore.setState({ portfolio, assumptions });
  }),
);

function renderCompare(selected: Scenario[]) {
  render(
    <ErrorBoundary>
      <CompareView selected={selected} />
    </ErrorBoundary>,
  );
}

describe("Compare with a scenario that breaks a rule (ADR 0123)", () => {
  it("compares the others and names the one left out", () => {
    renderCompare([base, crash]);
    expect(screen.queryByText(en.errorBoundary.invalidDataTitle)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      en.scenarios.notCompared("Crash −20 %"),
    );
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["Base"]);
  });

  it("shows the notice instead of the empty state when every pick is left out", () => {
    renderCompare([crash, vacancy]);
    expect(screen.getByRole("status").textContent).toBe(
      en.scenarios.notCompared("Crash −20 %") +
        en.scenarios.notCompared("Empty"),
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows no notice when every pick is valid", () => {
    renderCompare([base]);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
