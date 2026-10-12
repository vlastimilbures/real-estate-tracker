// The Import page's flow through the store, for tests: preview the batch, then import
// that plan (ADR 0096: `importCsv` always takes the previewed fingerprint).
import type { CsvImportBatch } from "../../../import/csvImport";
import { usePortfolioStore } from "../../portfolioStore";

export async function importNow(batch: CsvImportBatch) {
  const { fingerprint } = await usePortfolioStore.getState().previewCsv(batch);
  return usePortfolioStore.getState().importCsv(batch, fingerprint);
}
