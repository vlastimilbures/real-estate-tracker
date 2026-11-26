// The property actions of the portfolio store (#465). A write checks the loaded portfolio
// with the property in place inside the queued op, then writes.
import {
  insertPropertyWithCosts,
  deleteProperty,
  updateProperty,
  setPropertyActive,
  getPropertyExtras,
} from "../../data/repositories";
import { checkEdit, withRow } from "./rules";
import { success } from "../result";
import { toWriteError } from "../writeError";
import type { PortfolioState, StoreCtx } from "./types";

export function propertyActions({
  mutate,
  get,
  db,
}: StoreCtx): Pick<
  PortfolioState,
  | "addProperty"
  | "editProperty"
  | "getPropertyExtras"
  | "setPropertyActive"
  | "removeProperty"
> {
  return {
    addProperty: (added, cost, extra) =>
      mutate("properties", async (sql) => {
        // A PropertyEdit carries no flag: a new property is active.
        const p = { ...added, active: true };
        checkEdit(
          get().portfolio,
          (pf) => ({
            ...pf,
            properties: withRow(pf.properties, p),
            holdingCosts: withRow(pf.holdingCosts, cost),
          }),
          [p.id, cost.id],
        );
        await insertPropertyWithCosts(sql, p, extra, cost);
      }),
    editProperty: (edited, extra) =>
      mutate("properties", async (sql) => {
        const stored = get().portfolio?.properties.find(
          (x) => x.id === edited.id,
        );
        // A PropertyEdit carries no flag: keep the stored. The form always sends a
        // funding record (`{}` clears); one an edit leaves out is kept (ADR 0119 §8).
        const p = {
          ...edited,
          active: stored?.active ?? true,
          funding: edited.funding ?? stored?.funding,
        };
        checkEdit(
          get().portfolio,
          (pf) => ({ ...pf, properties: withRow(pf.properties, p) }),
          [p.id],
        );
        await updateProperty(sql, p, extra);
      }),
    // A failed read is the form's to show, not logged (ADR 0241).
    getPropertyExtras: async (id) => {
      const sql = db.get();
      try {
        return success(
          sql
            ? await getPropertyExtras(sql, id)
            : { address: null, garage: null },
        );
      } catch (e) {
        return { ok: false, error: toWriteError(e) };
      }
    },
    setPropertyActive: (id, active) =>
      mutate("properties", (sql) => setPropertyActive(sql, id, active)),
    removeProperty: (id) =>
      mutate("properties", (sql) => deleteProperty(sql, id)),
  };
}
