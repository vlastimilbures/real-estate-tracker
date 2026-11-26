// The UI store, built from its six slices: one store, so a component reads any field
// with one selector and an action can touch two slices.
import { create } from "zustand";
import { navigationSlice } from "./navigation";
import { leaveGuardSlice } from "./leaveGuard";
import { prefsSlice } from "./prefs";
import { feedbackSlice } from "./feedback";
import { compareSlice } from "./compare";
import { viewStateSlice } from "./viewState";
import type { UiState } from "./types";

export const useUiStore = create<UiState>((set, get) => {
  const ctx = { set, get };
  return {
    ...navigationSlice(ctx),
    ...leaveGuardSlice(ctx),
    ...prefsSlice(ctx),
    ...feedbackSlice(ctx),
    ...compareSlice(ctx),
    ...viewStateSlice(ctx),
  };
});
