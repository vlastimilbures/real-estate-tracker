// Navigation: the page shown, the open property and Settings tab, and the one-off
// requests a navigation hands its page (a Guide term, ⌘N's Add form, a property target).
// Every move goes through the leave guard.
import type { PropertyTarget, Route, SettingsTab } from "../navigation";
import { guarded } from "./leaveGuard";
import type { SliceCtx } from "./types";

export interface NavigationSlice {
  route: Route;
  selectedPropertyId: string | null;
  /** Which Settings sub-tab to show. In-memory; lets the menu/sidebar deep-link. */
  settingsTab: SettingsTab;
  /** Glossary entry the Guide should bring into view once. In-memory only. */
  guideTerm: string | null;
  /** Properties should open its Add form once (menu ⌘N). In-memory only. */
  newPropertyRequested: boolean;
  /** Property detail should move to this section, or open the property form, once (a
   *  data check fix link, ADR 0118). In-memory only. */
  propertyTarget: PropertyTarget | null;
  clearPropertyTarget: () => void;
  navigate: (route: Route) => void;
  /** Open a property; `target` = where its page lands (ADR 0118). */
  openProperty: (id: string, target?: PropertyTarget) => void;
  /** Navigate to Settings, optionally on a specific sub-tab. */
  openSettings: (tab?: SettingsTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  /** Open the Guide at a glossary term. */
  openGuide: (term: string) => void;
  /** The Guide has shown `guideTerm`. */
  clearGuideTerm: () => void;
  /** Go to Properties and open the Add form (File ▸ New Property…). */
  requestNewProperty: () => void;
  /** Properties has opened the Add form for `newPropertyRequested`. */
  clearNewPropertyRequest: () => void;
}

export function navigationSlice({ set, get }: SliceCtx): NavigationSlice {
  return {
    route: "dashboard",
    selectedPropertyId: null,
    settingsTab: "assumptions",
    guideTerm: null,
    newPropertyRequested: false,
    propertyTarget: null,
    clearPropertyTarget: () => set({ propertyTarget: null }),
    navigate: (route) => guarded(get, set, { route }),
    openProperty: (id, target) =>
      guarded(get, set, {
        route: "property",
        selectedPropertyId: id,
        propertyTarget: target ?? null,
      }),
    openSettings: (tab) =>
      guarded(
        get,
        set,
        tab ? { route: "settings", settingsTab: tab } : { route: "settings" },
      ),
    setSettingsTab: (settingsTab) => guarded(get, set, { settingsTab }),
    openGuide: (term) => guarded(get, set, { route: "guide", guideTerm: term }),
    clearGuideTerm: () => set({ guideTerm: null }),
    requestNewProperty: () =>
      guarded(get, set, { route: "properties", newPropertyRequested: true }),
    clearNewPropertyRequest: () => set({ newPropertyRequested: false }),
  };
}
