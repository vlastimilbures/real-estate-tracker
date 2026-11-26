// Navigation: the page shown, the open property and Settings tab, and the one-off request
// a navigation hands its page (⌘N's Add form, a Guide term, a property target). A request
// lives only for the visit it came with: every other navigation drops it (ADR 0269).
// Every move goes through the leave guard.
import type {
  PropertyTarget,
  Route,
  RouteRequest,
  SettingsTab,
} from "../navigation";
import { guarded } from "./leaveGuard";
import type { SliceCtx } from "./types";

export interface NavigationSlice {
  route: Route;
  selectedPropertyId: string | null;
  /** Which Settings sub-tab to show. In-memory; lets the menu/sidebar deep-link. */
  settingsTab: SettingsTab;
  /** What this visit's navigation asked its page to do, once, or null (ADR 0269). The
   *  page acts on each `id` once and never clears it; the next navigation does. */
  request: RouteRequest | null;
  navigate: (route: Route) => void;
  /** Open a property; `target` = where its page lands (ADR 0118). */
  openProperty: (id: string, target?: PropertyTarget) => void;
  /** Navigate to Settings, optionally on a specific sub-tab. */
  openSettings: (tab?: SettingsTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  /** Open the Guide at a glossary term. */
  openGuide: (term: string) => void;
  /** Go to Properties and open the Add form (File ▸ New Property…). */
  requestNewProperty: () => void;
}

export function navigationSlice({ set, get }: SliceCtx): NavigationSlice {
  // Each request's id, so a repeat (⌘N again) is a new request: the store's own.
  let requestSeq = 0;
  const nextId = () => ++requestSeq;
  return {
    route: "dashboard",
    selectedPropertyId: null,
    settingsTab: "assumptions",
    request: null,
    navigate: (route) => guarded(get, set, { route, request: null }),
    openProperty: (id, target) =>
      guarded(get, set, {
        route: "property",
        selectedPropertyId: id,
        request: target ? { page: "property", target, id: nextId() } : null,
      }),
    openSettings: (tab) =>
      guarded(
        get,
        set,
        tab
          ? { route: "settings", settingsTab: tab, request: null }
          : { route: "settings", request: null },
      ),
    setSettingsTab: (settingsTab) => guarded(get, set, { settingsTab }),
    openGuide: (term) =>
      guarded(get, set, {
        route: "guide",
        request: { page: "guide", term, id: nextId() },
      }),
    requestNewProperty: () =>
      guarded(get, set, {
        route: "properties",
        request: { page: "properties", id: nextId() },
      }),
  };
}
