// Hands a built Excel workbook to the user (the save dialog in the app). The IO half of
// the export; ui/model/xlsxExport.ts builds the bytes and stays pure (DR-066).
import { saveFile, type SaveOutcome } from "../state/platform";
import { buildXlsx, XLSX_MIME, type XlsxColumn } from "./model/xlsxExport";

/** Build the workbook and hand it to the user (save dialog in the app). */
export async function exportTableXlsx<R>(opts: {
  filename: string;
  sheetName: string;
  columns: XlsxColumn<R>[];
  rows: R[];
}): Promise<SaveOutcome> {
  return saveFile({
    filename: opts.filename,
    data: await buildXlsx(opts),
    mime: XLSX_MIME,
    filter: { name: "Excel workbook", extensions: ["xlsx"] },
  });
}
