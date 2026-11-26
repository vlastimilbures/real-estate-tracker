// The Scenarios compare: the ticked saved scenarios, the Base toggle and the price-crash
// preset timing. In-memory for the session (ADR 0101).
import { tickForCompare } from "../compareSelection";
import type { SliceCtx } from "./types";

/** Saved scenarios the compare shows at most; Base is always available alongside. */
export const MAX_COMPARE = 3;

export interface CompareSlice {
  /** Ticked saved-scenario ids, at most MAX_COMPARE. */
  compareIds: string[];
  compareBase: boolean;
  crashAtYear: number;
  toggleCompare: (id: string) => void;
  /** Tick `id` when there is room; false when compare is full (ADR 0093). */
  tickCompare: (id: string) => boolean;
  /** Drop ticked ids that are not in `existingIds` (deleted scenarios). */
  pruneCompare: (existingIds: readonly string[]) => void;
  toggleCompareBase: () => void;
  setCrashAtYear: (atYear: number) => void;
}

export function compareSlice({ set, get }: SliceCtx): CompareSlice {
  return {
    compareIds: [],
    compareBase: true,
    crashAtYear: 0,
    toggleCompare: (id) => {
      const ids = get().compareIds;
      if (ids.includes(id)) set({ compareIds: ids.filter((x) => x !== id) });
      else get().tickCompare(id);
    },
    tickCompare: (id) => {
      const next = tickForCompare(get().compareIds, id, MAX_COMPARE);
      set({ compareIds: next.ids });
      return next.ticked;
    },
    pruneCompare: (existingIds) => {
      const ids = get().compareIds;
      const kept = ids.filter((id) => existingIds.includes(id));
      if (kept.length !== ids.length) set({ compareIds: kept });
    },
    toggleCompareBase: () => set({ compareBase: !get().compareBase }),
    setCrashAtYear: (crashAtYear) => set({ crashAtYear }),
  };
}
