// @vitest-environment jsdom
//
// UX-079 (DR-158, ADR 0079): the Compare key figures show "n/a" and the reason for a
// scenario whose levered IRR has no value, next to a scenario that has one.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import {
  cpiIndex,
  portfolioKpis,
  portfolioProjection,
  realProjection,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import type { CompareResult } from "../../model/compare";

const projection = portfolioProjection(portfolio, assumptions);
const kpis = portfolioKpis(portfolio, assumptions);
const base: CompareResult = {
  id: "base",
  name: "Base",
  projection,
  realProjection: realProjection(projection, cpiIndex(assumptions)),
  kpis,
};
const flat: CompareResult = {
  ...base,
  id: "flat",
  name: "Flat",
  kpis: {
    ...kpis,
    leveredIrrNominal: null,
    leveredIrrNominalReason: "NOT_UNIQUE",
  },
};

vi.mock("../../../state/useEngine", () => ({
  useScenarioComparison: () => [base, flat],
}));

const { CompareView } = await import("../ScenarioCompare");

beforeEach(() =>
  act(() => useUiStore.setState({ language: "en", mode: "nominal" })),
);

describe("Compare levered IRR (UX-079)", () => {
  it("shows the rate for one scenario and n/a with the reason for the other", () => {
    render(<CompareView selected={[]} />);
    const na = screen.getByTitle(en.common.irrNotUnique);
    expect(na.textContent).toBe(
      `${en.common.notApplicable} (${en.common.irrNotUnique})`,
    );
    expect(screen.getByText(en.scenarios.kpiLeveredIrrNominal)).toBeTruthy();
    expect(screen.getAllByText("6,2 %").length).toBeGreaterThan(0);
  });
});

// UX-081 (DR-145, ADR 0080): the key figures are a table with a caption, scenario column
// headers and metric row headers.
describe("Compare key figures table semantics (UX-081)", () => {
  it("is a captioned table with column and row headers", () => {
    render(<CompareView selected={[]} />);
    const table = screen.getByRole("table", {
      name: en.scenarios.keyFiguresTitle,
    });
    const cols = within(table).getAllByRole("columnheader");
    expect(cols.map((c) => c.textContent)).toEqual(["Base", "Flat"]);
    const irrRow = within(table).getByRole("rowheader", {
      name: en.scenarios.kpiLeveredIrrNominal,
    });
    const cells = within(irrRow.closest("tr")!).getAllByRole("cell");
    expect(cells).toHaveLength(2);
    expect(cells[1]!.textContent).toBe(
      `${en.common.notApplicable} (${en.common.irrNotUnique})`,
    );
  });
});
