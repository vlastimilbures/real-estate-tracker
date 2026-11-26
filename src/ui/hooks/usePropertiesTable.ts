// The Properties table's data: its rows, the totals row and the page subtitle, all
// read at Today. It lives in ui/hooks, not src/state, because it composes ui/model
// functions, and state never imports the UI at runtime (ADR 0072).
import { useEngine, usePropertyProjections } from "../../state/useEngine";
import { asOfView, propertyRowsForAsOf } from "../model/dashboard";
import { propertiesTotal, type PropertiesTotal } from "../model/properties";
import { propertiesTableRows, type RowShow } from "../model/propertiesTable";
import { propertiesSubtitle } from "../model/tableContext";
import { useAsOf } from "./useAsOf";
import { useT } from "./useT";

export type PropertiesTableRow = ReturnType<
  typeof propertyRowsForAsOf
>[number] & { show: RowShow };

interface PropertiesTableData {
  rows: PropertiesTableRow[];
  total: PropertiesTotal | null;
  subtitle: string | undefined;
}

export function usePropertiesTable(): PropertiesTableData {
  const t = useT();
  // Today by the one resolver, as Property detail shows it at Today (ADR 0150); Properties
  // does not follow the picked as-of date (ADR 0111).
  const view = useAsOf({ followPick: false });
  const engine = useEngine(null, view?.date ?? null);
  // A second engine call, which rebuilds the loan schedules again; kept as it was.
  const projections = usePropertyProjections();
  if (!engine || !view) return { rows: [], total: null, subtitle: undefined };

  // The Today basis of the date, and each row read by it.
  const { assumptions, portfolio, snapshot } = engine;
  const basis = asOfView(assumptions.baseDate, view.date, view.isToday);
  const rows = projections
    ? propertiesTableRows(
        propertyRowsForAsOf(
          snapshot.perProperty,
          portfolio.properties,
          projections,
          basis,
          view.date,
          assumptions,
        ),
      )
    : [];
  return {
    rows,
    total: propertiesTotal(
      snapshot,
      engine.projection,
      basis,
      assumptions,
      portfolio.properties,
      t,
    ),
    subtitle:
      rows.length > 0
        ? propertiesSubtitle(
            t,
            rows.length,
            snapshot.asOf,
            basis,
            assumptions.baseDate,
          )
        : undefined,
  };
}
