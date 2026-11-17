// The Import page's flow for tests: preview a batch, then import it; the import builds
// its own plan at the click (ADR 0229).
import type { Sql } from "../../../data/sql";
import {
  importCsv,
  previewImport,
  type CsvImportBatch,
  type CsvImportReport,
} from "../../csvImport";

export async function importNow(
  sql: Sql,
  batch: CsvImportBatch,
): Promise<CsvImportReport> {
  await previewImport(sql, batch);
  return importCsv(sql, batch);
}
