// UI-only state: which screen is shown, which property is drilled into, the
// Nominal/Real lens, and the UI language. No business logic here — purely navigation +
// presentation mode.
import { create } from "zustand";
import type { Language } from "../i18n/types";
import type { Mode } from "../ui/model/lens";
import { THEME_KEY, readPersistedTheme, type Theme } from "./themePreference";
import type { CsvImportReport } from "./csv";
import { tickForCompare } from "./compareSelection";

export type Route =
  | "dashboard"
  | "properties"
  | "property"
  | "projections"
  | "scenarios"
  | "import"
  | "settings"
  | "guide";

/** Which sub-tab the Settings page opens on. */
export type SettingsTab = "assumptions" | "backup";

export type { Mode } from "../ui/model/lens";
export type { Theme } from "./themePreference";

/** Saved scenarios the compare shows at most; Base is always available alongside. */
export const MAX_COMPARE = 3;

const COLLAPSE_KEY = "ui.sidebarCollapsed";
const LANGUAGE_KEY = "ui.language";
/** Key of the removed display-currency picker (UX-017); cleared on load. */
const LEGACY_CURRENCY_KEY = "ui.currency";

function readLanguage(): Language {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY);
    if (v === "en" || v === "cs" || v === "ru") return v;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return "en";
}

function clearLegacyCurrency() {
  try {
    localStorage.removeItem(LEGACY_CURRENCY_KEY);
  } catch {
    /* localStorage unavailable — nothing to clear */
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore — persistence is best-effort */
  }
}

interface UiState {
  route: Route;
  selectedPropertyId: string | null;
  mode: Mode;
  /** Appearance preference; resolved + applied to <html> in src/ui/theme.ts. */
  theme: Theme;
  /** UI language. Persisted. Drives the i18n dictionary in src/i18n. */
  language: Language;
  /** Which Settings sub-tab to show. In-memory; lets the menu/sidebar deep-link. */
  settingsTab: SettingsTab;
  /** Left nav collapsed to an icon-only rail. Persisted. */
  sidebarCollapsed: boolean;
  /** Dashboard property filter. Empty = whole portfolio ("All"). In-memory only. */
  dashboardPropertyIds: string[];
  /** Snapshot "as of" date for Dashboard + Property detail. null = today. */
  asOf: Date | null;
  /** Whether the About modal is open. Opened from the native macOS menu. In-memory only. */
  aboutOpen: boolean;
  /** Glossary entry the Guide should bring into view once (UX-044). In-memory only. */
  guideTerm: string | null;
  /** Properties should open its Add form once (menu ⌘N, UX-066). In-memory only. */
  newPropertyRequested: boolean;
  /** Safety backup written by the last "Clear sample", for the Dashboard's confirmation
   *  (ADR 0094). In-memory only. */
  sampleClearedBackup: string | null;
  /** The last CSV import's report, kept until the next import (ADR 0096). In-memory. */
  lastImport: CsvImportReport | null;
  setLastImport: (report: CsvImportReport | null) => void;
  /** Scenarios compare: ticked saved-scenario ids (at most MAX_COMPARE), the Base
   *  toggle and the price-crash preset timing. In-memory for the session (ADR 0101). */
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
  /** Stress presets panel: a manual Show / Hide for the session, or null when the user
   *  has not chosen and the page decides on open (ADR 0106). */
  presetsOpen: boolean | null;
  setPresetsOpen: (open: boolean) => void;
  /** Property detail's amortization schedule is expanded. In-memory for the session,
   *  across properties (ADR 0107). */
  amortizationOpen: boolean;
  setAmortizationOpen: (open: boolean) => void;
  navigate: (route: Route) => void;
  openProperty: (id: string) => void;
  setMode: (mode: Mode) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  /** Navigate to Settings, optionally on a specific sub-tab. */
  openSettings: (tab?: SettingsTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  toggleSidebar: () => void;
  setDashboardPropertyIds: (ids: string[]) => void;
  setAsOf: (date: Date | null) => void;
  openAbout: () => void;
  closeAbout: () => void;
  /** Open the Guide at a glossary term (UX-044). */
  openGuide: (term: string) => void;
  /** The Guide has shown `guideTerm`. */
  clearGuideTerm: () => void;
  /** Go to Properties and open the Add form (File ▸ New Property…, UX-066). */
  requestNewProperty: () => void;
  /** Properties has opened the Add form for `newPropertyRequested`. */
  clearNewPropertyRequest: () => void;
  /** The sample was cleared: open the Dashboard and name the safety backup there. */
  showSampleCleared: (safetyBackup: string) => void;
  dismissSampleCleared: () => void;
  /** Some open form holds unsaved edits (UX-030): `unsavedSources` is not empty. */
  unsavedChanges: boolean;
  /** The open forms holding unsaved edits, one key per form, so a clean form never
   *  clears another form's flag. */
  unsavedSources: readonly string[];
  /** A navigation held back by `unsavedChanges`, waiting for Discard / Keep editing. */
  pendingLeave: (() => void) | null;
  /** Mark the form `source` as holding unsaved edits, or as clean. */
  setUnsavedChanges: (source: string, unsaved: boolean) => void;
  /** Discard the unsaved edits and carry out the held navigation. */
  confirmLeave: () => void;
  /** Keep editing: drop the held navigation. */
  cancelLeave: () => void;
}

/** Navigation that leaves the current screen or Settings tab: held back while a form
 *  has unsaved edits (UX-030); staying where you are never asks. */
function guarded(
  get: () => UiState,
  set: (s: Partial<UiState>) => void,
  target: Partial<UiState>,
) {
  const s = get();
  const moves = (Object.keys(target) as (keyof UiState)[]).some(
    (k) => s[k] !== target[k],
  );
  if (s.unsavedChanges && moves) set({ pendingLeave: () => set(target) });
  else set(target);
}

export const useUiStore = create<UiState>((set, get) => ({
  route: "dashboard",
  selectedPropertyId: null,
  mode: "nominal",
  theme: readPersistedTheme(),
  language: readLanguage(),
  settingsTab: "assumptions",
  sidebarCollapsed: readCollapsed(),
  dashboardPropertyIds: [],
  asOf: null,
  aboutOpen: false,
  guideTerm: null,
  newPropertyRequested: false,
  sampleClearedBackup: null,
  lastImport: null,
  setLastImport: (lastImport) => set({ lastImport }),
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
  presetsOpen: null,
  setPresetsOpen: (presetsOpen) => set({ presetsOpen }),
  amortizationOpen: false,
  setAmortizationOpen: (amortizationOpen) => set({ amortizationOpen }),
  unsavedChanges: false,
  unsavedSources: [],
  pendingLeave: null,
  navigate: (route) => guarded(get, set, { route }),
  openProperty: (id) =>
    guarded(get, set, { route: "property", selectedPropertyId: id }),
  setMode: (mode) => set({ mode }),
  setTheme: (theme) => {
    persist(THEME_KEY, theme);
    set({ theme });
  },
  setLanguage: (language) => {
    persist(LANGUAGE_KEY, language);
    set({ language });
  },
  openSettings: (tab) =>
    guarded(
      get,
      set,
      tab ? { route: "settings", settingsTab: tab } : { route: "settings" },
    ),
  setSettingsTab: (settingsTab) => guarded(get, set, { settingsTab }),
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    persist(COLLAPSE_KEY, String(next));
    set({ sidebarCollapsed: next });
  },
  setDashboardPropertyIds: (ids) => set({ dashboardPropertyIds: ids }),
  setAsOf: (date) => set({ asOf: date }),
  openAbout: () => set({ aboutOpen: true }),
  closeAbout: () => set({ aboutOpen: false }),
  openGuide: (term) => guarded(get, set, { route: "guide", guideTerm: term }),
  clearGuideTerm: () => set({ guideTerm: null }),
  requestNewProperty: () =>
    guarded(get, set, { route: "properties", newPropertyRequested: true }),
  clearNewPropertyRequest: () => set({ newPropertyRequested: false }),
  showSampleCleared: (safetyBackup) => {
    set({ sampleClearedBackup: safetyBackup });
    guarded(get, set, { route: "dashboard" });
  },
  dismissSampleCleared: () => set({ sampleClearedBackup: null }),
  setUnsavedChanges: (source, unsaved) => {
    const others = get().unsavedSources.filter((k) => k !== source);
    const unsavedSources = unsaved ? [...others, source] : others;
    set({ unsavedSources, unsavedChanges: unsavedSources.length > 0 });
  },
  confirmLeave: () => {
    const go = get().pendingLeave;
    set({ unsavedChanges: false, unsavedSources: [], pendingLeave: null });
    go?.();
  },
  cancelLeave: () => set({ pendingLeave: null }),
}));

// Amounts are always Kč (UX-017); drop a currency picked in an older version.
clearLegacyCurrency();
