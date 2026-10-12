// The Import page's flow for tests: preview a batch, then import it against that plan
// (ADR 0096: `importCsv` always takes the previewed fingerprint).
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
  const { fingerprint } = await previewImport(sql, batch);
  return importCsv(sql, batch, fingerprint);
}
