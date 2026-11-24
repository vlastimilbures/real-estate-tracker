// The property actions of the portfolio store (#465). A write checks the loaded portfolio
// with the property in place inside the queued op, then writes (UX-047).
import {
  insertPropertyWithCosts,
  deleteProperty,
  updateProperty,
  setPropertyActive,
  getPropertyExtras,
} from "../../data/repositories";
import { holdingCostToRow, propertyToRow } from "../../data/mappers";
import { checkEdit, withRow } from "./rules";
import type { PortfolioState, StoreCtx } from "./types";

export function propertyActions({
  mutate,
  get,
}: StoreCtx): Pick<
  PortfolioState,
  | "addProperty"
  | "editProperty"
  | "getPropertyExtras"
  | "setPropertyActive"
  | "removeProperty"
> {
  return {
    addProperty: (p, cost, extra) =>
      mutate("properties", async (sql) => {
        checkEdit(
          get().portfolio,
          (pf) => ({
            ...pf,
            properties: withRow(pf.properties, p),
            holdingCosts: withRow(pf.holdingCosts, cost),
          }),
          [p.id, cost.id],
        );
        await insertPropertyWithCosts(
          sql,
          propertyToRow(p, extra),
          holdingCostToRow(cost),
        );
      }),
    editProperty: (edited, extra) =>
      mutate("properties", async (sql) => {
        const stored = get().portfolio?.properties.find(
          (x) => x.id === edited.id,
        );
        // The form carries no flag: keep the stored. It always sends a funding record
        // (`{}` clears); one an edit leaves out is kept (ADR 0119 §8).
        const p = {
          ...edited,
          active: edited.active ?? stored?.active,
          funding: edited.funding ?? stored?.funding,
        };
        checkEdit(
          get().portfolio,
          (pf) => ({ ...pf, properties: withRow(pf.properties, p) }),
          [p.id],
        );
        await updateProperty(sql, propertyToRow(p, extra));
      }),
    getPropertyExtras: async (id) => {
      const sql = get().sql;
      return sql ? getPropertyExtras(sql, id) : { address: null, garage: null };
    },
    setPropertyActive: (id, active) =>
      mutate("properties", (sql) => setPropertyActive(sql, id, active)),
    removeProperty: (id) =>
      mutate("properties", (sql) => deleteProperty(sql, id)),
  };
}
