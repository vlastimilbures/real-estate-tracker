// Portfolio state: the engine INPUTS (portfolio + assumptions), loaded from SQLite and
// written through on every edit. This is the one-way data flow's source: DB → store →
// (useEngine) → UI. No finance maths here — edits persist, then in-memory state refreshes
// so the memoized engine recomputes (CLAUDE.md §4).
// The facade of state/portfolio (#465): the app's one store, with the app's database
// opener and the clock.
import { defaultOpen } from "../data/open";
import { createPortfolioStore } from "./portfolio/store";
export type {
  MutationResult,
  PropertyExtras,
  StartupError,
} from "./portfolio/types";

export const usePortfolioStore = createPortfolioStore({
  open: defaultOpen,
  now: () => new Date(),
});

/** A write is queued or running: row write actions are disabled (ADR 0253). */
export const useWriteRunning = (): boolean =>
  usePortfolioStore((s) => s.writesRunning > 0);
