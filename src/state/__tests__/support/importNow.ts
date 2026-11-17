// The Import page's flow through the store, for tests: preview the batch, then import
// it; the import builds its own plan at the click (ADR 0229).
import type { CsvImportBatch } from "../../../import/csvImport";
import { usePortfolioStore } from "../../portfolioStore";

export async function importNow(batch: CsvImportBatch) {
  await usePortfolioStore.getState().previewCsv(batch);
  return usePortfolioStore.getState().importCsv(batch);
}
