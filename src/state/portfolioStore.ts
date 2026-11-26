// Portfolio state: the engine INPUTS (portfolio + assumptions), loaded from SQLite and
// written through on every edit. This is the one-way data flow's source: DB → store →
// (useEngine) → UI. No finance maths here — edits persist, then in-memory state refreshes
// so the memoized engine recomputes (CLAUDE.md §4). The facade of state/portfolio: the
// app's one store, with the app's database opener and the clock.
import { defaultOpen } from "../data/open";
import { createPortfolioStore } from "./portfolio/store";
import { useUiStore } from "./uiStore";
export type { MutationResult, StartupError, Status } from "./portfolio/types";
/** Address and garage: stored, but not engine inputs (ADR 0184 §3).
 *  @internal test seam: UI tests reach the type through the state facade (ADR 0072). */
export type { PropertyExtras } from "./portfolio/types";
/** What the property form sends: a property without its `active` flag. */
export type { PropertyEdit } from "./portfolio/types";

const { store, db } = createPortfolioStore({
  open: defaultOpen,
  now: () => new Date(),
  // Replacing the data drops the UI's notice, failure and import report (ADR 0154).
  dataReplaced: () => useUiStore.getState().dataReplaced(),
});

export const usePortfolioStore = store;

/** The store's open database (`get`) and a test's replacement for it (`set`).
 *  @internal test seam: the app reaches the database only through the store's actions. */
export const portfolioDb = db;

/** A write is queued or running: row write actions are disabled (ADR 0253). */
export const useWriteRunning = (): boolean =>
  usePortfolioStore((s) => s.writesRunning > 0);
