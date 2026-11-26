// The UI store's state: one store made of six slices, each in its own file. A slice's
// actions read and write the whole state, so one action can touch two slices (Clear
// sample's notice and its move to the Dashboard).
import type { NavigationSlice } from "./navigation";
import type { LeaveGuardSlice } from "./leaveGuard";
import type { PrefsSlice } from "./prefs";
import type { FeedbackSlice } from "./feedback";
import type { CompareSlice } from "./compare";
import type { ViewStateSlice } from "./viewState";

export type UiState = NavigationSlice &
  LeaveGuardSlice &
  PrefsSlice &
  FeedbackSlice &
  CompareSlice &
  ViewStateSlice;

/** What a slice is built from: the store's own `set` and `get`. */
export interface SliceCtx {
  set: (s: Partial<UiState>) => void;
  get: () => UiState;
}
