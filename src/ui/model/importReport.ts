// CSV import report rows: each written table under its translated panel title instead of
// the raw table name (UX-034).
import type { Dictionary } from "../../i18n";
import type { CsvImportReport } from "../../import/csvImport";

export function importReportRows(
  t: Dictionary,
  upserted: CsvImportReport["upserted"],
): { label: string; value: string }[] {
  const p = t.importPage;
  return [
    { label: p.propertiesTitle, value: p.upserted(upserted.properties) },
    { label: p.valuationsTitle, value: p.upserted(upserted.valuations) },
    { label: p.rentsTitle, value: p.upserted(upserted.leases) },
    { label: p.mortgagesTitle, value: p.upserted(upserted.mortgage_blocks) },
  ];
}
