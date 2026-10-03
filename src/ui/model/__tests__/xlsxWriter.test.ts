// The .xlsx writer end-to-end (exceljs round-trip): the cells hold the display-rounded
// values with the matching number formats (D-10, DR-028).
import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { portfolioProjection } from "../../../engine";
import { projectionSeries, projectionColumns } from "../projection";
import { en } from "../../../i18n/en";
import { buildXlsx, numFmt, type XlsxColumn } from "../xlsxExport";

const rows = projectionSeries(
  portfolioProjection(portfolio, assumptions),
  "nominal",
  assumptions,
);
const columns = projectionColumns(en, assumptions.baseDate);
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

  it("a text cell that looks like a formula is written as literal text", async () => {
    const s = await sheet(
      [{ header: "Name", kind: "text", value: (r: string) => r }],
      ["=1+1"],
    );
    const c = s.getRow(2).getCell(1);
    expect(c.type).toBe(ExcelJS.ValueType.String);
    expect(c.value).toBe("'=1+1");
  });
});
