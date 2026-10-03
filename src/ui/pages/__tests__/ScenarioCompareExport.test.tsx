// @vitest-environment jsdom
//
// ADR 0108 (#56): the Key figures panel exports the whole compare to Excel, under the
// lens and always as values, whatever the Values / Δ toggle shows.
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
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { cellMoney } from "../../../lib/format";
import type { CompareResult } from "../../model/compare";

function result(id: string, name: string, overrides = {}): CompareResult {
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

const base = result("base", "Base");
const crash = result("crash", "Price crash", {
  valueShock: { pct: rate("0.2"), atYear: 0 },
});

let results: CompareResult[] = [];
vi.mock("../../../state/useEngine", () => ({
  useScenarioComparison: () => results,
}));
const save = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/saveFile", () => ({ saveFile: save }));

const { CompareView } = await import("../ScenarioCompare");

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ kind: "saved", filename: "x.xlsx" });
  act(() => useUiStore.setState({ language: "en", mode: "real" }));
});

describe("Compare export to Excel (ADR 0108)", () => {
  it("saves the compare under the lens, as values even in the Δ view", async () => {
    results = [base, crash];
    render(<CompareView selected={[]} />);
    await userEvent.click(
      screen.getByRole("button", { name: en.scenarios.viewDeltaVsBase }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.xlsx.exportToExcel }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    const [opts] = save.mock.calls[0] as [
      { filename: string; data: Uint8Array },
    ];
    expect(opts.filename).toBe("scenario-compare-real.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(opts.data.buffer as ArrayBuffer);
    const ws = wb.getWorksheet(en.xlsx.sheetNames.compareKeyFigures)!;
    expect(ws.getRow(1).values).toEqual([
      undefined,
      en.xlsx.metric,
      "Base",
      "Price crash",
    ]);
    const row = [...Array(ws.rowCount).keys()]
      .map((i) => ws.getRow(i + 1))
      .find((r) => r.getCell(1).value === en.scenarios.kpiNetWorthReal)!;
    expect(row.getCell(3).value).toBe(cellMoney(crash.kpis.netWorthReal));
  });

  it("is offered without Base too", () => {
    results = [crash];
    render(<CompareView selected={[]} />);
    expect(
      screen.getByRole("button", { name: en.xlsx.exportToExcel }),
    ).toBeTruthy();
  });
});
