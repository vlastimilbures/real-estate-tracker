// Every Excel export the app has, pinned cell for cell before the projection export
// shares ProjectionGrid's column list (#492): each sheet's name, frozen panes, column
// widths, header row, and every cell's value, number format and weight. The projection
// and compare sheets are pinned whole; an amortization sheet pins its first and last
// rows and a digest of all its cells.
import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { exportTableXlsx, exportWorkbookXlsx } from "../exportXlsx";
import {
  isoDate,
  portfolioProjection,
  propertySchedules,
  rate,
  type Assumptions,
  type Portfolio,
} from "../../engine";
import { assumptions, portfolio } from "../../engine/__tests__/support/seed";
import { withEvents } from "../../engine/__tests__/support/events";
import { mixed } from "../../engine/__tests__/support/mixed";
import { en } from "../../i18n/en";
import { cs } from "../../i18n/cs";
import type { Dictionary } from "../../i18n";
import { projectionSeries } from "../model/projection";
import { projectionExport } from "../model/tableContext";
import { amortizationColumns } from "../model/propertyDetail";
import { compareWorkbook } from "../model/compareXlsx";
import type { Mode } from "../model/lens";
import { compareResult } from "./support/compareResult";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../platform/saveFile", () => ({ saveFile: save }));

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ kind: "saved", filename: "x.xlsx" });
});

/** A cell as [value, number format, bold]. */
function cellOf(c: ExcelJS.Cell): [unknown, string | null, boolean] {
  const v = c.value instanceof Date ? c.value.toISOString() : c.value;
  return [v ?? null, c.numFmt ?? null, c.font?.bold === true];
}

/** Each row as one line: its cells as JSON. */
function rowsOf(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells = [];
    for (let i = 1; i <= ws.columnCount; i++)
      cells.push(cellOf(row.getCell(i)));
    out.push(JSON.stringify(cells));
  });
  return out;
}

/** The saved workbook read back: per sheet, its layout and cells. */
async function saved(opts: { whole: boolean }) {
  const [{ filename, data }] = save.mock.calls.at(-1) as [
    { filename: string; data: Uint8Array },
  ];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data.buffer as ArrayBuffer);
  return {
    filename,
    sheets: wb.worksheets.map((ws) => {
      const rows = rowsOf(ws);
      const layout = {
        name: ws.name,
        views: ws.views,
        widths: ws.columns.map((c) => c.width),
        rowCount: ws.rowCount,
      };
      if (opts.whole) return { ...layout, rows };
      return {
        ...layout,
        head: rows.slice(0, 4),
        tail: rows.slice(-3),
        digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      };
    }),
  };
}

const calendarYears: Assumptions = {
  ...assumptions,
  baseDate: isoDate("2025-12-31"),
};

describe("projection exports (Projections and Property detail)", () => {
  const cases: [string, Dictionary, Portfolio, Assumptions, Mode][] = [
    ["seed, en, nominal", en, portfolio, assumptions, "nominal"],
    ["seed, cs, real", cs, portfolio, assumptions, "real"],
    ["mixed with events, en, real", en, withEvents(mixed), assumptions, "real"],
    ["mixed, cs, nominal", cs, mixed, assumptions, "nominal"],
    [
      "seed, calendar years, en, nominal",
      en,
      portfolio,
      calendarYears,
      "nominal",
    ],
  ];
  for (const [name, t, p, a, mode] of cases) {
    it(name, async () => {
      const rows = projectionSeries(portfolioProjection(p, a), mode, a);
      await exportTableXlsx(
        projectionExport(
          t,
          { name: "Portfolio", id: "portfolio" },
          rows,
          mode,
          a.baseDate,
        ),
      );
      expect(await saved({ whole: true })).toMatchSnapshot();
    });
  }
});

describe("amortization exports (Property detail)", () => {
  for (const [name, t, p, id] of [
    ["seed, en", en, portfolio, "javorova"],
    ["loan events, cs", cs, withEvents(portfolio), "javorova"],
    ["development loan with events, en", en, withEvents(mixed), "dev"],
  ] as const) {
    it(name, async () => {
      const rows = propertySchedules(
        p.mortgages.filter((m) => m.propertyId === id),
        [id],
        assumptions,
      ).get(id)!.rows;
      await exportTableXlsx({
        filename: `${id}-amortization.xlsx`,
        sheetName: t.xlsx.sheetNames.amortization,
        columns: (shown) => amortizationColumns(t, shown),
        rows,
        notes: [id],
      });
      expect(await saved({ whole: false })).toMatchSnapshot();
    });
  }
});

describe("the Scenario compare workbook", () => {
  const results = [
    compareResult("base"),
    compareResult("shock", "shock", {
      inflationShock: { deltaPa: rate("0.06"), durationYears: 3 },
    }),
  ];
  for (const mode of ["nominal", "real"] as const) {
    it(mode, async () => {
      await exportWorkbookXlsx(compareWorkbook(en, results, mode));
      expect(await saved({ whole: true })).toMatchSnapshot();
    });
  }
});
