// The row actions of the portfolio store: valuations, leases, mortgage blocks and holding
// costs. Each write checks the loaded portfolio with the row in place inside the queued
// op, then writes.
import type { Sql } from "../../data/sql";
import { leaseClosedBy, valuationClosedBy, type Portfolio } from "../../engine";
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

/** How a kind of effective-dated record ends the one before it (ADR 0099). */
interface Succession<K extends "valuations" | "leases"> {
  key: K;
  closedBy: (
    rows: Portfolio[K],
    row: Portfolio[K][number],
  ) => Portfolio[K][number] | undefined;
  insert: (sql: Sql, row: Portfolio[K][number]) => Promise<void>;
  insertClosing: (
    sql: Sql,
    row: Portfolio[K][number],
    closedPrev: Portfolio[K][number],
  ) => Promise<void>;
}

/** Add `row`, ending the record before it as `s.closedBy` says, in the same write. Both
 *  run inside the queued op, so the predecessor is read from every earlier write. */
function addSucceeding<K extends "valuations" | "leases">(
  { mutate, get }: StoreCtx,
  s: Succession<K>,
  row: Portfolio[K][number],
): Promise<MutationResult> {
  type Row = Portfolio[K][number];
  const put = (p: Portfolio, ...rows: Row[]) => ({
    ...p,
    [s.key]: rows.reduce((list, r) => withRow<Row>(list, r), p[s.key] as Row[]),
  });
  return mutate(s.key, async (sql) => {
    const portfolio = get().portfolio;
    const prev = s.closedBy(portfolio?.[s.key] ?? [], row);
    if (!prev) {
      checkEdit(portfolio, (p) => put(p, row), [row.id]);
      await s.insert(sql, row);
      return;
    }
    // Ending the predecessor only shortens it: an overlap it already had with another
    // stored lease is not this add's to report (ADR 0163 §4).
    checkEdit(portfolio, (p) => put(p, prev, row), [row.id, prev.id], [row.id]);
    await s.insertClosing(sql, row, prev);
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
): Pick<PortfolioState, "addValuation" | "saveValuation" | "removeValuation"> {
  return {
    addValuation: (v) =>
      addSucceeding(
        ctx,
        {
          key: "valuations",
          closedBy: valuationClosedBy,
          insert: insertValuation,
          insertClosing: insertValuationClosingPrevious,
        },
        v,
      ),
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
  return {
    addLease: (l) =>
      addSucceeding(
        ctx,
        {
          key: "leases",
          closedBy: leaseClosedBy,
          insert: insertLease,
          insertClosing: insertLeaseClosingPrevious,
        },
        l,
      ),
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
