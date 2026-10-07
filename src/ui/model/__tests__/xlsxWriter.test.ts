// The .xlsx writer end-to-end (exceljs round-trip): the cells hold the display-rounded
// values with the matching number formats (D-10, DR-028).
import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { portfolioProjection } from "../../../engine";
import { projectionSeries, projectionColumns } from "../projection";
import { en } from "../../../i18n/en";
import { D, type Decimal } from "../../../lib/money";
import {
  buildWorkbook,
  buildXlsx,
  numFmt,
  xlsxSheet,
  type XlsxColumn,
} from "../xlsxExport";

const rows = projectionSeries(
  portfolioProjection(portfolio, assumptions),
  "nominal",
  assumptions,
);
const columns = projectionColumns(en, assumptions.baseDate, rows);
let ws: ExcelJS.Worksheet;

async function sheet<R>(cols: XlsxColumn<R>[], data: R[]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    (await buildXlsx({ sheetName: "S", columns: cols, rows: data }))
      .buffer as ArrayBuffer,
  );
  return wb.getWorksheet("S")!;
}

beforeAll(async () => {
  ws = await sheet(columns, rows);
});

const colIdx = (h: string) => columns.findIndex((c) => c.header === h) + 1;

describe("buildXlsx — projection sheet", () => {
  it("writes a bold header row with the column headers, then one row per year", () => {
    const header = ws.getRow(1);
    expect(header.font?.bold).toBe(true);
    expect(columns.map((_, i) => header.getCell(i + 1).value)).toEqual(
      columns.map((c) => c.header),
    );
    expect(ws.rowCount).toBe(rows.length + 1);
  });

  it("applies the number format of each column's kind", () => {
    const r = ws.getRow(2);
    expect(r.getCell(colIdx("Value")).numFmt).toBe('#,##0" Kč"');
    expect(r.getCell(colIdx("LTV")).numFmt).toBe(numFmt("percent"));
    expect(r.getCell(colIdx("DSCR")).numFmt).toBe(numFmt("multiple"));
  });

  it("the opening row blanks flow cells and writes the Period label", () => {
    const r = ws.getRow(2);
    expect(r.getCell(colIdx("Year")).value).toBe(2026);
    expect(r.getCell(colIdx("Period")).value).toBe("opening");
    expect(r.getCell(colIdx("NOI")).value).toBeNull();
  });

  it("money cells hold the displayed whole Kč (D-10, DR-028)", () => {
    expect(ws.getRow(2).getCell(colIdx("Debt")).value).toBe(9_515_405);
    for (let i = 2; i <= ws.rowCount; i++)
      for (const h of ["Value", "Debt", "Equity", "NOI", "Net CF"]) {
        const v = ws.getRow(i).getCell(colIdx(h)).value;
        if (v !== null) expect(Number.isInteger(v), `${h} row ${i}`).toBe(true);
      }
  });

  it("a text cell that looks like a formula is text as typed, in the Text format (ADR 0145)", async () => {
    const s = await sheet(
      [{ header: "Name", kind: "text", value: (r: string) => r }],
      ["=1+1"],
    );
    const c = s.getRow(2).getCell(1);
    expect(c.type).toBe(ExcelJS.ValueType.String);
    expect(c.value).toBe("=1+1");
    expect(c.numFmt).toBe("@");
  });

  it("a +/- scenario name keeps its text; a NaN money cell is empty (ADR 0145)", async () => {
    const s = await sheet(
      [
        {
          header: "Scenario",
          kind: "text",
          value: (r: [string, number]) => r[0],
        },
        { header: "+2 % rates", kind: "money", value: (r) => r[1] },
      ],
      [["-10 % rent", NaN]],
    );
    const header = s.getRow(1).getCell(2);
    expect(header.value).toBe("+2 % rates");
    expect(header.numFmt).toBe("@");
    expect(header.font?.bold).toBe(true);
    const name = s.getRow(2).getCell(1);
    expect(name.value).toBe("-10 % rent");
    expect(name.numFmt).toBe("@");
    expect(s.getRow(2).getCell(2).value).toBeNull();
    expect(s.getRow(1).getCell(1).numFmt).toBeUndefined();
  });
});

describe("buildWorkbook — several sheets", () => {
  interface Metric {
    label: string;
    kind: "money" | "percent";
    v: Decimal;
  }
  const metrics: Metric[] = [
    { label: "Equity", kind: "money", v: D("1234567.6") },
    { label: "LTV", kind: "percent", v: D("0.61234") },
  ];
  let wb: ExcelJS.Workbook;

  beforeAll(async () => {
    wb = new ExcelJS.Workbook();
    const bytes = await buildWorkbook([
      xlsxSheet<Metric>({
        name: "Metrics",
        columns: [
          { header: "Metric", kind: "text", value: (r) => r.label },
          {
            header: "A",
            kind: "money",
            kindOf: (r) => r.kind,
            value: (r) => r.v,
          },
        ],
        rows: metrics,
        notes: ["* a note", "=not a formula"],
      }),
      xlsxSheet<number>({
        name: "Years",
        columns: [{ header: "Year", kind: "int", value: (r) => r }],
        rows: [2026, 2027],
      }),
    ]);
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  });

  it("writes one worksheet per sheet, in order", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Metrics", "Years"]);
    expect(wb.getWorksheet("Years")!.getRow(3).getCell(1).value).toBe(2027);
  });

  it("a per-row kind sets each row's rounding and number format", () => {
    const ws = wb.getWorksheet("Metrics")!;
    expect(ws.getRow(2).getCell(2).value).toBe(1_234_568);
    expect(ws.getRow(2).getCell(2).numFmt).toBe(numFmt("money"));
    expect(ws.getRow(3).getCell(2).value).toBe(0.612);
    expect(ws.getRow(3).getCell(2).numFmt).toBe(numFmt("percent"));
  });

  it("notes follow the table after one blank row, as typed text (ADR 0145)", () => {
    const ws = wb.getWorksheet("Metrics")!;
    expect(ws.getRow(4).getCell(1).value).toBeNull();
    expect(ws.getRow(5).getCell(1).value).toBe("* a note");
    expect(ws.getRow(5).getCell(1).numFmt).toBeUndefined();
    expect(ws.getRow(6).getCell(1).value).toBe("=not a formula");
    expect(ws.getRow(6).getCell(1).numFmt).toBe("@");
    expect(ws.rowCount).toBe(6);
  });
});
