// @vitest-environment jsdom
//
// The Scenario compare view: the key figures table and its Values / Δ vs Base toggle,
// the owner-loss rows, levered IRR without a value, the own-rate note, the three charts,
// the Excel export, and a scenario that breaks an engine rule. Each `describe` is one
// behaviour; the decision behind it is in the comment above it. The comparison is mocked
// (`results`), except where `results` is null: then the real one runs on the store.
//
// Class names are asserted only where the class is the contract: the chart grid and the
// flush, pinned-column table are CSS layout jsdom cannot measure (ux-capture checks how
// they look), and a footnote is a plain paragraph with no role, so `.ct-footnote` is how
// the page marks one.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExcelJS from "exceljs";
import { rate, type Scenario } from "../../../engine";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { cellMoney } from "../../../lib/format";
import type { CompareResult } from "../../model/compare";
import { SMALL_CHART_HEIGHT } from "../../components/charts";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import {
  compareResult,
  mockScenarioComparison,
} from "../../__tests__/support/compareResult";

/** The comparison the view gets; null runs the real one. */
let results: CompareResult[] | null = [];
vi.mock("../../../state/useEngine", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../../state/useEngine")>();
  const mocked = mockScenarioComparison(() => results ?? []);
  return {
    ...real,
    useScenarioComparison: (scenarios: Scenario[]) =>
      results
        ? mocked.useScenarioComparison()
        : real.useScenarioComparison(scenarios),
  };
});
const save = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/saveFile", () => ({ saveFile: save }));

const { ScenarioCompareView } = await import("../ScenarioCompare");

const sc = en.scenarios;
const base = compareResult("base", "Base");
const crash = compareResult("crash", "Price crash", {
  valueShock: { pct: rate("0.2"), atYear: 0 },
});
const rateShock = compareResult("rate", "Rate shock", {
  rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
});
const flat: CompareResult = {
  ...base,
  id: "flat",
  name: "Flat",
  kpis: {
    ...base.kpis,
    leveredIrrNominal: null,
    leveredIrrNominalReason: "NOT_UNIQUE",
  },
};

const cellsOf = (label: string) => {
  const row = screen.getByRole("rowheader", { name: label });
  return within(row.closest("tr")!).getAllByRole("cell");
};
const textsOf = (label: string) => cellsOf(label).map((c) => c.textContent);
/** The saved scenarios behind `list`, as the page passes them. */
const asSelected = (list: CompareResult[] | null): Scenario[] =>
  (list ?? []).map((r) => ({ id: r.id, name: r.name, overrides: {} }));
const toggle = () => screen.queryByRole("group", { name: sc.viewToggleLabel });

/** The workbook the one save was given (after the test waited for the save). */
async function savedWorkbook() {
  const [opts] = save.mock.calls[0] as [{ filename: string; data: Uint8Array }];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(opts.data.buffer as ArrayBuffer);
  return {
    filename: opts.filename,
    ws: wb.getWorksheet(en.xlsx.sheetNames.compareKeyFigures)!,
  };
}

// Every test starts from scratch, so no describe depends on the order they run in: the
// setup file (src/__tests__/setup/stores.ts) puts both stores back to their initial
// state (`getInitialState()`, the lens and the portfolio included) before each test, and
// here the mocked comparison and the save spy start empty.
beforeEach(() => {
  results = [];
  save.mockReset();
  save.mockResolvedValue({ kind: "saved", filename: "x.xlsx" });
});

// ADR 0080: a captioned table, scenario column headers, metric row headers.
// ADR 0216 §2: a flush data table with a pinned metric column.
describe("the key figures table", () => {
  it("is a captioned table with column and row headers", () => {
    results = [base, flat];
    render(<ScenarioCompareView selected={[]} />);
    const table = screen.getByRole("table", { name: sc.keyFiguresTitle });
    const cols = within(table).getAllByRole("columnheader");
    expect(cols.map((c) => c.textContent)).toEqual(["Base", "Flat"]);
    const irrRow = within(table).getByRole("rowheader", {
      name: sc.kpiLeveredIrrNominal,
    });
    const cells = within(irrRow.closest("tr")!).getAllByRole("cell");
    expect(cells).toHaveLength(2);
    expect(cells[1]!.textContent).toBe(
      `${en.common.notApplicable} (${en.common.irrNotUnique})`,
    );
  });

  it("is a flush data table with a pinned metric column", () => {
    results = [base, compareResult("a", "A")];
    render(<ScenarioCompareView selected={asSelected(results)} />);
    const table = screen.getByRole("table", { name: sc.keyFiguresTitle });
    expect(table.classList.contains("data")).toBe(true);
    expect(table.closest(".panel-body")?.classList.contains("flush")).toBe(
      true,
    );
    expect(table.closest(".table-wrap")).not.toBeNull();
    const rowHeads = table.querySelectorAll("tbody th[scope=row]");
    expect(rowHeads.length).toBeGreaterThan(0);
    for (const th of rowHeads)
      expect(th.classList.contains("sticky-col")).toBe(true);
    expect(
      table
        .querySelector("thead th, thead td")!
        .classList.contains("sticky-col"),
    ).toBe(true);
  });
});

// ADR 0097: with Base in the comparison, the key figures can switch every cell to the
// scenario's difference to Base. Without Base there is no toggle.
describe("the Values / Δ vs Base toggle", () => {
  it("switches the key figures to the difference to Base", async () => {
    results = [base, crash];
    render(<ScenarioCompareView selected={[]} />);
    const values = screen.getByRole("button", { name: sc.viewValues });
    expect(values.getAttribute("aria-pressed")).toBe("true");
    expect(textsOf(sc.kpiNetWorthNominal)[1]).toBe("74,5 M Kč");

    await userEvent.click(
      screen.getByRole("button", { name: sc.viewDeltaVsBase }),
    );
    expect(textsOf(sc.kpiNetWorthNominal)).toEqual(["—", "−18,6 M Kč"]);
    expect(
      screen.queryByRole("rowheader", { name: sc.kpiNetWorthDeltaVsBase }),
    ).toBeNull();
    expect(
      screen.getByText(sc.rebasedReturnsFootnote("Price crash")),
    ).toBeTruthy();
  });

  it("without Base there is no toggle and the table shows values", async () => {
    results = [base, crash];
    const { rerender } = render(<ScenarioCompareView selected={[]} />);
    await userEvent.click(
      screen.getByRole("button", { name: sc.viewDeltaVsBase }),
    );
    results = [crash];
    rerender(<ScenarioCompareView selected={[]} />);
    expect(toggle()).toBeNull();
    expect(textsOf(sc.kpiNetWorthNominal)).toEqual(["74,5 M Kč"]);
  });
});

// ADR 0089: with Base and a price crash at Today, the key figures show starting equity
// and Δ net worth vs Base, and mark the crash's rebased returns with a footnote. A
// scenario with Base's starting equity gets no marker and no footnote.
describe("the owner-loss rows", () => {
  it("shows starting equity, Δ net worth and the rebased-returns footnote", () => {
    results = [base, crash];
    render(<ScenarioCompareView selected={[]} />);
    expect(textsOf(sc.kpiStartingEquity)).toEqual(["19,2 M Kč", "13,5 M Kč"]);
    expect(textsOf(sc.kpiNetWorthDeltaVsBase)).toEqual(["—", "−18,6 M Kč"]);

    const note = screen.getByText(sc.rebasedReturnsFootnote("Price crash"));
    const multiple = cellsOf(sc.kpiNetWorthMultiple);
    expect(multiple[1]!.getAttribute("aria-describedby")).toBe(
      note.closest("p")!.id,
    );
    expect(multiple[0]!.getAttribute("aria-describedby")).toBeNull();
  });

  it("a rate shock keeps Base's starting equity: no marker, no footnote", () => {
    results = [base, rateShock];
    const { container } = render(<ScenarioCompareView selected={[]} />);
    expect(container.querySelector(".ct-footnote")).toBeNull();
    // The marker shows exactly when the cell is described by the footnote.
    expect(
      screen
        .getAllByRole("cell")
        .filter((c) => c.hasAttribute("aria-describedby")),
    ).toHaveLength(0);
  });
});

// ADR 0079: "n/a" and the reason for a scenario whose levered IRR has no value, next to
// a scenario that has one.
describe("levered IRR without a value", () => {
  it("shows the rate for one scenario and n/a with the reason for the other", () => {
    results = [base, flat];
    render(<ScenarioCompareView selected={[]} />);
    const na = screen.getByTitle(en.common.irrNotUnique);
    expect(na.textContent).toBe(
      `${en.common.notApplicable} (${en.common.irrNotUnique})`,
    );
    expect(screen.getByText(sc.kpiLeveredIrrNominal)).toBeTruthy();
    expect(screen.getAllByText("6,2 %").length).toBeGreaterThan(0);
  });
});

// ADR 0190: a scenario's appreciation level does not reach a property with its own rate;
// the compare names it under the key figures table and in the Excel notes.
describe("the own-rate note", () => {
  const baseScenario: Scenario = { id: "base", name: "Base", overrides: {} };
  const low: Scenario = {
    id: "low",
    name: "Low growth",
    overrides: { appreciationPa: rate("0") },
  };
  const [first, ...rest] = portfolio.properties;
  const own = { ...first!, appreciationOverridePa: rate("0.01") };
  const line = sc.levelNotApplied("Low growth", own.name);
  const resultOf = (s: Scenario) => compareResult(s.id, s.name, s.overrides);

  beforeEach(() => {
    results = [resultOf(baseScenario), resultOf(low)];
    act(() => {
      usePortfolioStore.setState({
        portfolio: { ...portfolio, properties: [own, ...rest] },
      });
    });
  });

  it("names the properties with their own rate under the table", () => {
    const { container } = render(
      <ScenarioCompareView selected={[baseScenario, low]} />,
    );
    expect(screen.getByText(line)).toBe(
      container.querySelector(".ct-footnote"),
    );
  });

  it("the Excel export carries the line in the Key figures notes", async () => {
    render(<ScenarioCompareView selected={[baseScenario, low]} />);
    await userEvent.click(
      screen.getByRole("button", { name: en.xlsx.exportToExcel }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const { ws } = await savedWorkbook();
    const firstCells = [...Array(ws.rowCount).keys()].map(
      (i) => ws.getRow(i + 1).getCell(1).value,
    );
    expect(firstCells).toContain(line);
  });

  it("a scenario left out of the comparison gets no line", () => {
    results = [resultOf(baseScenario)];
    const { container } = render(
      <ScenarioCompareView selected={[baseScenario, low]} />,
    );
    expect(screen.getByText(sc.notCompared("Low growth"))).toBeTruthy();
    expect(container.querySelector(".ct-footnote")).toBeNull();
  });

  it("two scenarios with the same name each keep their line", () => {
    const twin = { ...low, id: "low-2" };
    results = [resultOf(baseScenario), resultOf(low), resultOf(twin)];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ScenarioCompareView selected={[baseScenario, low, twin]} />);
    expect(screen.getAllByText(line)).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("no property with its own rate: no note", () => {
    act(() => usePortfolioStore.setState({ portfolio }));
    const { container } = render(
      <ScenarioCompareView selected={[baseScenario, low]} />,
    );
    expect(container.querySelector(".ct-footnote")).toBeNull();
  });
});

// ADR 0216 §1: the three charts share one row (a grid that never leaves a cell empty), at
// the small-multiple height.
describe("the charts", () => {
  beforeEach(() => {
    results = [base, compareResult("a", "A")];
  });

  it("three charts in the trio grid, inside a container-query wrap", () => {
    const { container } = render(
      <ScenarioCompareView selected={asSelected(results)} />,
    );
    const grid = container.querySelector(".chart-grid-wrap > .chart-grid.trio");
    expect(grid).not.toBeNull();
    expect(grid!.children).toHaveLength(3);
  });

  it("each at the Dashboard's small-multiple height", () => {
    expect(SMALL_CHART_HEIGHT).toBe(180);
    const { container } = render(
      <ScenarioCompareView selected={asSelected(results)} />,
    );
    const plots = [
      ...container.querySelectorAll<HTMLElement>(
        ".chart-grid.trio .recharts-responsive-container",
      ),
    ];
    expect(plots).toHaveLength(3);
    for (const p of plots)
      expect(p.style.height).toBe(`${SMALL_CHART_HEIGHT}px`);
  });
});

// ADR 0108: the key figures export the whole compare to Excel, under the lens and always
// as values, whatever the Values / Δ toggle shows.
describe("the Excel export", () => {
  beforeEach(() => act(() => useUiStore.setState({ mode: "real" })));

  it("saves the compare under the lens, as values even in the Δ view", async () => {
    results = [base, crash];
    render(<ScenarioCompareView selected={[]} />);
    await userEvent.click(
      screen.getByRole("button", { name: sc.viewDeltaVsBase }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.xlsx.exportToExcel }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const { filename, ws } = await savedWorkbook();
    expect(filename).toBe("scenario-compare-real.xlsx");
    expect(ws.getRow(1).values).toEqual([
      undefined,
      en.xlsx.metric,
      "Base",
      "Price crash",
    ]);
    const row = [...Array(ws.rowCount).keys()]
      .map((i) => ws.getRow(i + 1))
      .find((r) => r.getCell(1).value === sc.kpiNetWorthReal)!;
    expect(row.getCell(3).value).toBe(cellMoney(crash.kpis.netWorthReal));
  });

  it("is offered without Base too", () => {
    results = [crash];
    render(<ScenarioCompareView selected={[]} />);
    expect(
      screen.getByRole("button", { name: en.xlsx.exportToExcel }),
    ).toBeTruthy();
  });
});

// ADR 0123: a saved scenario whose overrides break an engine rule (from before the store
// checked them) is left out of the compare and named above it; the page keeps working.
// The real comparison runs here, on the seed portfolio.
describe("a scenario that breaks an engine rule", () => {
  const baseScenario: Scenario = { id: "base", name: "Base", overrides: {} };
  const badCrash: Scenario = {
    id: "crash",
    name: "Crash −20 %",
    overrides: { valueShock: { pct: rate("-0.2"), atYear: 0 } },
  };
  const vacancy: Scenario = {
    id: "vac",
    name: "Empty",
    overrides: { vacancyAllowance: rate("1.5") },
  };
  const renderCompare = (selected: Scenario[]) =>
    render(
      <ErrorBoundary>
        <ScenarioCompareView selected={selected} />
      </ErrorBoundary>,
    );

  beforeEach(() => {
    results = null;
    act(() => {
      usePortfolioStore.setState({ portfolio, assumptions });
    });
  });

  it("compares the others and names the one left out", () => {
    renderCompare([baseScenario, badCrash]);
    expect(screen.queryByText(en.errorBoundary.invalidDataTitle)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      sc.notCompared("Crash −20 %"),
    );
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["Base"]);
  });

  it("shows the notice instead of the empty state when every pick is left out", () => {
    renderCompare([badCrash, vacancy]);
    expect(screen.getByRole("status").textContent).toBe(
      sc.notCompared("Crash −20 %") + sc.notCompared("Empty"),
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows no notice when every pick is valid", () => {
    renderCompare([baseScenario]);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
