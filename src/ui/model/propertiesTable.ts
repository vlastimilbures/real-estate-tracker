// What each Properties row shows.
import type { Decimal } from "../../lib/money";

/** Which of a row's cells hold figures: `figures` for the value, flows, ratios and
 *  equity; `debt` for the debt cell. */
export interface RowShow {
  figures: boolean;
  debt: boolean;
}

/** The rows with what each one shows. A pending purchase has no figures yet (ADR 0156),
 *  but a pending loan already drawn is owed now, so its debt is shown, as the Dashboard's
 *  total debt counts it (ADR 0165). */
export function propertiesTableRows<
  R extends { owned: boolean; debt: Decimal },
>(rows: readonly R[]): (R & { show: RowShow })[] {
  return rows.map((r) => ({
    ...r,
    show: { figures: r.owned, debt: r.owned || !r.debt.isZero() },
  }));
}
