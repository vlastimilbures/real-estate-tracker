// Presentation-layer Excel export. Column-driven so any table (projection, amortization)
// reuses the same writer. NOT engine code — lives in ui/model. Pure: building the bytes;
// handing them to the user is src/ui/exportXlsx.ts (DR-066).
//
// D-10: every number cell holds the value rounded exactly as the screen shows it
// (src/lib/format.ts cell* helpers), as a number with a matching Excel format, so the
// sheet shows and sums what the app shows. Text cells that Excel could read as a
// formula are written as literal text (DR-087).
import type { Decimal } from "../../lib/money";
import { cellMoney, cellMultiple, cellPct } from "../../lib/format";
import { getActiveCurrency } from "../../lib/currency";

/** How a column's value is shown — and therefore rounded and formatted. */
export type CellKind =
  | "money" // whole currency units, `#,##0 "Kč"`
  | "percent" // fraction shown with 1 decimal, `0.0%` (LTV)
  | "rate" // fraction shown with 2 decimals, `0.00%` (interest rate)
  | "multiple" // 2 decimals, `0.00"x"`
  | "date" // `dd.mm.yyyy`
  | "int"
  | "text";

/** What a column extracts for one row. `null` → an empty cell. */
export type Cell = Decimal | number | string | Date | null;

export interface XlsxColumn<R> {
  header: string;
  kind: CellKind;
  value: (row: R) => Cell;
}

/** Excel number format per kind (CLAUDE.md §5 display conventions). */
export function numFmt(kind: CellKind): string | undefined {
  switch (kind) {
    case "money":
      return `#,##0" ${getActiveCurrency().symbol}"`;
    case "percent":
      return "0.0%";
    case "rate":
      return "0.00%";
    case "multiple":
      return '0.00"x"';
    case "date":
      return "dd.mm.yyyy";
    default:
      return undefined;
  }
}

/** A text cell starting with = + - @ (or tab / CR) is a formula to Excel: prefix an
 *  apostrophe so it stays literal text (DR-087). */
export function safeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** The value written to a cell of `kind`. */
export function cellValue(
  kind: CellKind,
  v: Cell,
): number | string | Date | null {
  if (v === null) return null;
  if (v instanceof Date) return v;
  if (kind === "text") return safeText(String(v));
  if (typeof v === "string") return safeText(v);
  switch (kind) {
    case "money":
      return cellMoney(v);
    case "percent":
      return cellPct(v, 1);
    case "rate":
      return cellPct(v, 2);
    case "multiple":
      return cellMultiple(v, 2);
    default:
      return typeof v === "number" ? v : v.toNumber();
  }
}

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Build the workbook bytes (pure: no download, no dialog). */
export async function buildXlsx<R>(opts: {
  sheetName: string;
  columns: XlsxColumn<R>[];
  rows: R[];
}): Promise<Uint8Array> {
  const { sheetName, columns, rows } = opts;
  // Lazy-load exceljs (~1 MB) only when the user actually exports, keeping it out of the
  // initial bundle. The browser UMD build's ESM-interop shape varies (namespace vs
  // `.default`), so tolerate both rather than relying on one.
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  const headerRow = ws.addRow(columns.map((c) => safeText(c.header)));
  headerRow.font = { bold: true };

  for (const row of rows) {
    const r = ws.addRow(columns.map((c) => cellValue(c.kind, c.value(row))));
    columns.forEach((c, i) => {
      const fmt = numFmt(c.kind);
      if (fmt) r.getCell(i + 1).numFmt = fmt;
    });
  }

  // Reasonable column widths from header length.
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(10, c.header.length + 2);
  });

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
