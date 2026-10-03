// CSV import preview and report shaping (ADR 0096): the plan's items grouped per file,
// record labels, and each changed column as display text. Replaces the per-table
// "N added or updated" rows (UX-034).
import type { Dictionary } from "../../i18n";
import type { CsvFile, FieldChange, ImportItem } from "../../import/csvImport";
import { isoDate } from "../../engine";
import { fmtCzk, fmtDate, fmtPct } from "../../lib/format";

export interface FileGroup {
  file: CsvFile;
  /** The file panel's translated title. */
  title: string;
  added: ImportItem[];
  updated: ImportItem[];
  unchanged: number;
}

const FILES: CsvFile[] = ["properties", "valuations", "rents", "mortgages"];

function fileTitle(t: Dictionary, file: CsvFile): string {
  const p = t.importPage;
  switch (file) {
    case "properties":
      return p.propertiesTitle;
    case "valuations":
      return p.valuationsTitle;
    case "rents":
      return p.rentsTitle;
    case "mortgages":
      return p.mortgagesTitle;
  }
}

/** One group per file that has items, in the Import page's panel order. */
export function groupByFile(t: Dictionary, items: ImportItem[]): FileGroup[] {
  return FILES.flatMap((file) => {
    const mine = items.filter((i) => i.file === file);
    if (mine.length === 0) return [];
    return [
      {
        file,
        title: fileTitle(t, file),
        added: mine.filter((i) => i.kind === "add"),
        updated: mine.filter((i) => i.kind === "update"),
        unchanged: mine.filter((i) => i.kind === "unchanged").length,
      },
    ];
  });
}

/** Records the import adds and updates; unchanged ones are not counted. */
export function importCounts(items: ImportItem[]): {
  added: number;
  updated: number;
} {
  return {
    added: items.filter((i) => i.kind === "add").length,
    updated: items.filter((i) => i.kind === "update").length,
  };
}

const showDate = (iso: string) => fmtDate(isoDate(iso));

/** `Byt Javorova`, or `Byt Javorova · 01.06.2026` for a child row. */
export function itemLabel(item: ImportItem): string {
  return item.date === null
    ? item.propertyName
    : `${item.propertyName} · ${showDate(item.date)}`;
}

const MONEY = new Set([
  "purchase_price",
  "market_value",
  "monthly_rent",
  "initial_principal",
  "monthly_instalment",
]);
const RATES = new Set([
  "interest_rate_pa",
  "appreciation_override_pa",
  "rent_index_override_pa",
]);
const DATES = new Set([
  "purchase_date",
  "valid_to",
  "end_date",
  "contract_maturity_date",
]);

/** A stored cell as the app shows it; empty ⇒ "—". */
function showValue(field: string, v: string | null): string {
  if (v === null) return "—";
  if (MONEY.has(field)) return fmtCzk(v);
  if (RATES.has(field)) return fmtPct(v, 2);
  if (DATES.has(field)) return showDate(v);
  if (field === "garage") return v === "1" ? "true" : "false";
  return v;
}

/** `before → after`, each value formatted for its column. */
export function changeText(change: FieldChange): string {
  return `${showValue(change.field, change.before)} → ${showValue(change.field, change.after)}`;
}
