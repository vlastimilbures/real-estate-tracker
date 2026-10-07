// Presentation-layer Excel export. Column-driven so any table (projection, amortization)
// reuses the same writer. NOT engine code — lives in ui/model. Pure: building the bytes;
// handing them to the user is src/ui/exportXlsx.ts (DR-066).
//
// D-10: every number cell holds the value rounded exactly as the screen shows it
// (src/lib/format.ts cell* helpers), as a number with a matching Excel format, so the
// sheet shows and sums what the app shows; a non-finite number is an empty cell. Text is
// written as typed; text Excel could read as a formula gets the Text format (ADR 0145).
import type { Worksheet } from "exceljs";
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
  /** A per-row kind instead of `kind`, for a table whose rows are metrics. */
  kindOf?: (row: R) => CellKind;
  value: (row: R) => Cell;
}

/** One worksheet: a bold header row, one row per item, then optional note lines. */
export interface XlsxSheet<R> {
  name: string;
  columns: XlsxColumn<R>[];
  rows: R[];
  /** Text lines under the table (after one blank row), in the first column. */
  notes?: string[];
}

/** A sheet with its cells already extracted, so sheets of different row types fit one
 *  workbook. Built by `xlsxSheet`. */
export interface XlsxSheetCells {
  name: string;
  headers: string[];
  rows: { kind: CellKind; value: Cell }[][];
  notes: string[];
}

/** Extract a sheet's cells: each column's kind (per row with `kindOf`) and value. */
export function xlsxSheet<R>(sheet: XlsxSheet<R>): XlsxSheetCells {
  const { name, columns, rows, notes = [] } = sheet;
  return {
    name,
    headers: columns.map((c) => c.header),
    rows: rows.map((row) =>
      columns.map((c) => ({
        kind: c.kindOf ? c.kindOf(row) : c.kind,
        value: c.value(row),
      })),
    ),
    notes,
  };
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

type Written = number | string | Date | null;

/** The number format of a written cell: Text ('@') for text starting with = + - @ (or
 *  tab / CR), so re-entering it in Excel keeps it text, not a formula (ADR 0145). A
 *  shared-string cell in the file is never a formula, so the text itself is unchanged. */
export function cellFmt(kind: CellKind, written: Written): string | undefined {
  return typeof written === "string" && /^[=+\-@\t\r]/.test(written)
    ? "@"
    : numFmt(kind);
}

/** The value written to a cell of `kind`. A non-finite number is an empty cell
 *  (ADR 0145, ADR 0108 §5). */
export function cellValue(kind: CellKind, v: Cell): Written {
  if (v === null) return null;
  if (v instanceof Date) return v;
  if (kind === "text") return String(v);
  if (typeof v === "string") return v;
  const n = numberFor(kind, v);
  return Number.isFinite(n) ? n : null;
}

function numberFor(kind: CellKind, v: Decimal | number): number {
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

/** Append one row: each cell's written value and number format. */
function addCells(ws: Worksheet, cells: { kind: CellKind; value: Cell }[]) {
  const written = cells.map((c) => {
    const value = cellValue(c.kind, c.value);
    return { value, fmt: cellFmt(c.kind, value) };
  });
  const row = ws.addRow(written.map((w) => w.value));
  written.forEach(({ fmt }, i) => {
    if (fmt) row.getCell(i + 1).numFmt = fmt;
  });
  return row;
}

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Build the workbook bytes for one sheet (pure: no download, no dialog). */
export async function buildXlsx<R>(opts: {
  sheetName: string;
  columns: XlsxColumn<R>[];
  rows: R[];
}): Promise<Uint8Array> {
  const { sheetName, columns, rows } = opts;
  return buildWorkbook([xlsxSheet({ name: sheetName, columns, rows })]);
}

/** Build the workbook bytes, one worksheet per sheet in order (pure). */
export async function buildWorkbook(
  sheets: XlsxSheetCells[],
): Promise<Uint8Array> {
  // Lazy-load exceljs (~1 MB) only when the user actually exports, keeping it out of the
  // initial bundle. The browser UMD build's ESM-interop shape varies (namespace vs
  // `.default`), so tolerate both rather than relying on one.
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();

  for (const { name, headers, rows, notes } of sheets) {
    const ws = wb.addWorksheet(name);

    const text = (value: string) => ({ kind: "text" as const, value });
    addCells(ws, headers.map(text)).font = { bold: true };

    for (const cells of rows) addCells(ws, cells);

    if (notes.length > 0) {
      ws.addRow([]);
      for (const note of notes) addCells(ws, [text(note)]);
    }

    // Reasonable column widths from header length.
    headers.forEach((h, i) => {
      ws.getColumn(i + 1).width = Math.max(10, h.length + 2);
    });
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
