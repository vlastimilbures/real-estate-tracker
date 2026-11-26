// The row actions of the portfolio store: valuations, leases, mortgage blocks and holding
// costs. Each write checks the loaded portfolio with the row in place inside the queued
// op, then writes.
import type { Sql } from "../../data/sql";
import { dayBefore, openPredecessor, type Portfolio } from "../../engine";
import {
  insertValuation,
  insertValuationClosingPrevious,
  updateValuation,
  deleteValuation,
  insertLease,
  insertLeaseClosingPrevious,
  updateLease,
  deleteLease,
  insertMortgageBlock,
  updateMortgageBlock,
  deleteMortgageBlock,
  upsertHoldingCost,
} from "../../data/repositories";
import type { WriteTarget } from "../writeTargets";
import { checkEdit, withRow } from "./rules";
import type { MutationResult, PortfolioState, StoreCtx } from "./types";

/** The portfolio's row lists that a row action edits. */
type RowKey = "valuations" | "leases" | "mortgages" | "holdingCosts";

/** Write `row` of `p[key]` to `target`: check the loaded portfolio with `row` in place of
 *  the row with its id, then run `write`. Both run inside the queued op, so the check
 *  sees every earlier write and the row mapping in `write` runs after the check. */
export function writeRow<K extends RowKey>(
  { mutate, get }: StoreCtx,
  target: WriteTarget,
  key: K,
  row: Portfolio[K][number],
  write: (sql: Sql) => Promise<unknown>,
): Promise<MutationResult> {
  return mutate(target, async (sql) => {
    checkEdit(
      get().portfolio,
      (p) => ({ ...p, [key]: withRow<Portfolio[K][number]>(p[key], row) }),
      [row.id],
    );
    await write(sql);
  });
}

/** Delete the row `id` from `target` through `remove`. */
export const removeRow = (
  { mutate }: StoreCtx,
  target: WriteTarget,
  remove: (sql: Sql, id: string) => Promise<void>,
  id: string,
): Promise<MutationResult> => mutate(target, (sql) => remove(sql, id));

export function valuationActions(
  ctx: StoreCtx,
): Pick<
  PortfolioState,
  | "addValuation"
  | "addValuationClosingPrevious"
  | "saveValuation"
  | "removeValuation"
> {
  const { mutate, get } = ctx;
  return {
    addValuation: (v) =>
      writeRow(ctx, "valuations", "valuations", v, (sql) =>
        insertValuation(sql, v),
      ),
    addValuationClosingPrevious: (v, closedPrev) =>
      mutate("valuations", async (sql) => {
        checkEdit(
          get().portfolio,
          (p) => ({
            ...p,
            valuations: withRow(withRow(p.valuations, closedPrev), v),
          }),
          [v.id, closedPrev.id],
        );
        await insertValuationClosingPrevious(sql, v, closedPrev);
      }),
    saveValuation: (v) =>
      writeRow(ctx, "valuations", "valuations", v, (sql) =>
        updateValuation(sql, v),
      ),
    removeValuation: (id) => removeRow(ctx, "valuations", deleteValuation, id),
  };
}

export function leaseActions(
  ctx: StoreCtx,
): Pick<PortfolioState, "addLease" | "saveLease" | "removeLease"> {
  const { mutate, get } = ctx;
  return {
    addLease: (l) =>
      mutate("leases", async (sql) => {
        const prev = openPredecessor(
          get().portfolio?.leases ?? [],
          l.propertyId,
          l.startDate,
          (x) => x.startDate,
          (x) => x.endDate,
        );
        if (!prev) {
          checkEdit(
            get().portfolio,
            (p) => ({ ...p, leases: withRow(p.leases, l) }),
            [l.id],
          );
          await insertLease(sql, l);
          return;
        }
        const closedPrev = { ...prev, endDate: dayBefore(l.startDate) };
        // Ending the predecessor only shortens it: an overlap it already had with another
        // stored lease is not this add's to report (ADR 0163 §4).
        checkEdit(
          get().portfolio,
          (p) => ({ ...p, leases: withRow(withRow(p.leases, closedPrev), l) }),
          [l.id, closedPrev.id],
          [l.id],
        );
        await insertLeaseClosingPrevious(sql, l, closedPrev);
      }),
    saveLease: (l) =>
      writeRow(ctx, "leases", "leases", l, (sql) => updateLease(sql, l)),
    removeLease: (id) => removeRow(ctx, "leases", deleteLease, id),
  };
}

export function blockActions(
  ctx: StoreCtx,
): Pick<
  PortfolioState,
  "addMortgageBlock" | "saveMortgageBlock" | "removeMortgageBlock"
> {
  return {
    addMortgageBlock: (m) =>
      writeRow(ctx, "mortgage_blocks", "mortgages", m, (sql) =>
        insertMortgageBlock(sql, m),
      ),
    saveMortgageBlock: (m) =>
      writeRow(ctx, "mortgage_blocks", "mortgages", m, (sql) =>
        updateMortgageBlock(sql, m),
      ),
    removeMortgageBlock: (id) =>
      removeRow(ctx, "mortgage_blocks", deleteMortgageBlock, id),
  };
}

export function holdingCostActions(
  ctx: StoreCtx,
): Pick<PortfolioState, "saveHoldingCost"> {
  return {
    saveHoldingCost: (h) =>
      writeRow(ctx, "holding_costs", "holdingCosts", h, (sql) =>
        upsertHoldingCost(sql, h),
      ),
  };
}
