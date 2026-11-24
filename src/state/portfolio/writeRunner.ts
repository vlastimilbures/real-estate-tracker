// The store's write runner (DR-085, ADR 0228, ADR 0253): the queue, the reload after each
// write and the refusals after a failed read-back (#465).
import type { Sql } from "../../data/sql";
import { EngineInputError } from "../../engine";
import { toWriteError } from "../writeError";
import { logFailure } from "../../data/errorLog";
import { markDataChanged } from "../../data/repositories";
import { perfMark, perfMeasure } from "../../lib/perf";
import { createWriteQueue } from "./writeQueue";
import type { WriteTarget } from "../writeTargets";
import type {
  DbHandle,
  MutationResult,
  PortfolioState,
  SetState,
  StoreAccess,
} from "./types";

/** Refresh after a write; on failure log it. After a `committed` write the app stops
 *  on the error screen (ADR 0228); after a failed one it stays, showing the write
 *  error, since nothing was saved. Never throws. Not queued: the reload inside a
 *  queued write, where queueing it would wait for itself. */
async function reloadAfter(
  { set, get }: StoreAccess,
  committed: boolean,
): Promise<void> {
  try {
    await get().refresh();
  } catch (e) {
    logFailure("RELOAD", e);
    if (committed)
      set({
        status: "error",
        readBackFailed: true,
        error: null,
        startupError: null,
      });
  }
}

/** Keep `target` for the error screen: refused because a read-back failed, named, and
 *  not kept yet (ADR 0255). */
function keepRefused({ set, get }: StoreAccess, target: WriteTarget): void {
  const { readBackFailed, refusedWrites } = get();
  if (
    !readBackFailed ||
    target === "bookkeeping" ||
    refusedWrites.includes(target)
  )
    return;
  set({ refusedWrites: [...refusedWrites, target] });
}

/** Persist via `op`, then reload portfolio + assumptions so the engine recomputes.
 *  Never throws into the void: a failure is captured, surfaced via `error`, and
 *  returned to the caller as `{ ok: false }`. On failure we still reload so the
 *  in-memory state matches what actually reached disk. Multi-statement writes are
 *  atomic (`Sql.transaction`, D-14), so a failed op leaves the DB unchanged, and a
 *  resolved op has committed: a failed reload after it returns `{ ok: true }` and
 *  stops on the error screen (ADR 0228). A write queued behind that is refused. */
async function mutateNow(
  store: StoreAccess,
  markChanged: (sql: Sql) => Promise<void>,
  target: WriteTarget,
  op: (sql: Sql) => Promise<void>,
  changesData: boolean,
): Promise<MutationResult> {
  const { set, get, db } = store;
  const sql = db.get();
  if (!sql || get().readBackFailed) {
    keepRefused(store, target);
    const error = toWriteError(new Error("Database not initialised"));
    set({ error });
    return { ok: false, error };
  }
  try {
    perfMark("edit:start");
    await op(sql);
    if (changesData) await markChanged(sql);
    await reloadAfter(store, true);
    // Write + reload; the recompute and page render are measured where they run.
    perfMeasure("edit-saved", "edit:start");
    set({ error: null });
    return { ok: true };
  } catch (e) {
    // A broken input rule is the user's to fix in the form, not a failure to log;
    // it is thrown before anything is written, so there is nothing to reload. Only
    // returned: the form shows it, and a non-form caller uses showError (ADR 0141).
    if (e instanceof EngineInputError)
      return { ok: false, error: toWriteError(e) };
    logFailure("WRITE", e);
    const error = toWriteError(e);
    await reloadAfter(store, false);
    set({ error });
    return { ok: false, error };
  }
}

/** The write runner's steps, one per store. */
export type WriteRunner = ReturnType<typeof createWriteRunner>;

/** The store's write path (DR-085, ADR 0228, ADR 0253): every write runs in the one
 *  queue, then reloads. `enqueue` is for reads that wait in it; `writesSoFar` counts the
 *  data writes so far. */
export function createWriteRunner(
  set: SetState,
  get: () => PortfolioState,
  db: DbHandle,
) {
  const store: StoreAccess = { set, get, db };
  const { enqueue, write } = createWriteQueue((n) => set({ writesRunning: n }));
  /** Data writes so far: an export keeps the changed flag when one landed while its
   *  save dialog was open, since the file does not hold it (ADR 0110). */
  let writes = 0;

  const mutate = (
    target: WriteTarget,
    op: (sql: Sql) => Promise<void>,
    changesData = true,
  ): Promise<MutationResult> =>
    write(() => mutateNow(store, markChanged, target, op, changesData));

  /** Run `op` in the mutation queue, then reload; rethrow its failure unchanged
   *  (after reloading in-memory state from the DB). For operations whose callers
   *  show their own typed errors (DR-047: pages no longer touch the raw `sql`). Once
   *  `op` has resolved it has committed: a failed reload stops on the error screen and
   *  `op`'s result still returns (ADR 0228). */
  function exclusive<T>(
    target: WriteTarget,
    op: (sql: Sql) => Promise<T>,
    changesData = true,
  ): Promise<T> {
    return write(async () => {
      const sql = requireSql(target);
      try {
        const result = await op(sql);
        if (changesData) await markChanged(sql);
        await reloadAfter(store, true);
        return result;
      } catch (e) {
        await reloadAfter(store, false);
        throw e;
      }
    });
  }

  /** `exclusive` for an operation that replaces the data, counted in `replacing` from
   *  the call until it settles. On success the banner `error` from an earlier edit no
   *  longer applies (ADR 0154). */
  async function replaceData<T>(
    target: WriteTarget,
    op: (sql: Sql) => Promise<T>,
  ): Promise<T> {
    set({ replacing: get().replacing + 1 });
    try {
      const result = await exclusive(target, op);
      set({ error: null });
      return result;
    } finally {
      set({ replacing: get().replacing - 1 });
    }
  }

  /** Data was written: the last backup no longer has it (ADR 0110). Best effort — a
   *  failure is logged and never fails the write that already succeeded. */
  async function markChanged(sql: Sql): Promise<void> {
    writes += 1;
    try {
      await markDataChanged(sql);
    } catch (e) {
      logFailure("WRITE", e);
    }
  }

  /** The open database, unless a read-back failed: then the screen may be older than
   *  the database, so a write queued behind it is refused (ADR 0228) and its `target`
   *  kept for the screen (ADR 0255). A read passes none. */
  function requireSql(target?: WriteTarget): Sql {
    const sql = db.get();
    if (!sql || get().readBackFailed) {
      if (target) keepRefused(store, target);
      throw new Error("Database not initialised");
    }
    return sql;
  }

  return {
    enqueue,
    mutate,
    exclusive,
    replaceData,
    requireSql,
    writesSoFar: () => writes,
  };
}
