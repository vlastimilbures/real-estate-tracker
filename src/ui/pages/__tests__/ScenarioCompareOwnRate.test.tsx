// @vitest-environment jsdom
//
// ADR 0190 (#166): a scenario's appreciation level does not reach a property with its own
// rate; the compare names it under the key-figures table and in the Excel notes.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExcelJS from "exceljs";
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

let results: CompareResult[] = [];
vi.mock("../../../state/useEngine", () => ({
  useScenarioComparison: () => results,
}));
const save = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/saveFile", () => ({ saveFile: save }));

const { CompareView } = await import("../ScenarioCompare");

const [first, ...rest] = portfolio.properties;
const own = { ...first!, appreciationOverridePa: rate("0.01") };
const line = en.scenarios.levelNotApplied("Low growth", own.name);

beforeEach(() => {
  results = [result(base), result(low)];
  save.mockReset();
  save.mockResolvedValue({ kind: "saved", filename: "x.xlsx" });
  act(() => {
    useUiStore.setState({ language: "en", mode: "nominal" });
    usePortfolioStore.setState({
      portfolio: { ...portfolio, properties: [own, ...rest] },
    });
  });
});

describe("Compare own-rate note (ADR 0190)", () => {
  it("names the properties with their own rate under the table", () => {
    const { container } = render(<CompareView selected={[base, low]} />);
    expect(screen.getByText(line)).toBe(
      container.querySelector(".ct-footnote"),
    );
  });

  it("the Excel export carries the line in the Key figures notes", async () => {
    render(<CompareView selected={[base, low]} />);
    await userEvent.click(
      screen.getByRole("button", { name: en.xlsx.exportToExcel }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [opts] = save.mock.calls[0] as [{ data: Uint8Array }];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(opts.data.buffer as ArrayBuffer);
    const ws = wb.getWorksheet(en.xlsx.sheetNames.compareKeyFigures)!;
    const firstCells = [...Array(ws.rowCount).keys()].map(
      (i) => ws.getRow(i + 1).getCell(1).value,
    );
    expect(firstCells).toContain(line);
  });

  it("a scenario left out of the comparison gets no line", () => {
    results = [result(base)];
    const { container } = render(<CompareView selected={[base, low]} />);
    expect(
      screen.getByText(en.scenarios.notCompared("Low growth")),
    ).toBeTruthy();
    expect(container.querySelector(".ct-footnote")).toBeNull();
  });

  it("two scenarios with the same name each keep their line", () => {
    const twin = { ...low, id: "low-2" };
    results = [result(base), result(low), result(twin)];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<CompareView selected={[base, low, twin]} />);
    expect(screen.getAllByText(line)).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("no property with its own rate: no note", () => {
    act(() => usePortfolioStore.setState({ portfolio }));
    const { container } = render(<CompareView selected={[base, low]} />);
    expect(container.querySelector(".ct-footnote")).toBeNull();
  });
});
