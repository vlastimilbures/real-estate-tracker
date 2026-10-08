// UI-only state: which screen is shown, which property is drilled into, the
// Nominal/Real lens, and the UI language. No business logic here — purely navigation +
// presentation mode.
import { create } from "zustand";
import { isDictionaryLoaded, loadDictionary } from "../i18n";
import type { Language } from "../i18n/types";
import type { Mode } from "../ui/model/lens";
import type {
  PropertyFormTarget,
  PropertySection,
} from "../ui/model/sectionNav";
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

/** Where Property detail lands once: a section, or the open property form (ADR 0118). */
export type PropertyTarget = PropertySection | PropertyFormTarget;
export type { Theme } from "./themePreference";

/** How long a toast stays: one duration for every page (ADR 0154). */
export const TOAST_MS = 4000;

/** A whole-database action, or an export, whose failure is reported (ADR 0154). */
export type OutcomeAction =
  | "restore"
  | "pickBackup"
  | "backupExport"
  | "loadSample"
  | "import"
  | "xlsxExport";

/** The safety copy a restore or Clear sample wrote: the owner's undo file, named on
 *  every page until dismissed (ADR 0154). */
export type Notice =
  { kind: "restored"; file: string } | { kind: "sampleCleared"; file: string };

/** A failed action, shown on every page until dismissed or the next action starts. Its
 *  own slot, so a failure never hides the safety copy's name (ADR 0154). Data, not
 *  text: it is translated when it renders. */
export interface Failure {
  action: OutcomeAction;
  error: unknown;
}

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
  /** Property detail should move to this section, or open the property form, once (a
   *  data check fix link, ADR 0118). In-memory only. */
  propertyTarget: PropertyTarget | null;
  clearPropertyTarget: () => void;
  /** A short confirmation, cleared after TOAST_MS. `id` tells a repeat apart. */
  toast: { message: string; id: number } | null;
  /** Show `message` as the toast; a newer one replaces it and restarts the timer. */
  showToast: (message: string) => void;
  /** The last safety copy, until dismissed (ADR 0154). In-memory only. */
  notice: Notice | null;
  setNotice: (notice: Notice) => void;
  dismissNotice: () => void;
  /** The last failed action, until dismissed or the next action starts. In-memory. */
  failure: Failure | null;
  setFailure: (action: OutcomeAction, error: unknown) => void;
  dismissFailure: () => void;
  /** The data was replaced (restore, Clear sample, Load sample): drop the notice, the
   *  failure and the import report, which describe the old data (ADR 0154). */
  dataReplaced: () => void;
  /** The sidebar backup reminder was hidden for this session (ADR 0110). In-memory. */
  backupHintDismissed: boolean;
  /** The last CSV import's report, kept until the next import or until the data is
   *  replaced (ADR 0096, ADR 0154). In-memory. */
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
  /** Dashboard data check: a manual Show / Hide for the session, or null when the page
   *  decides (open when something needs attention, ADR 0118). */
  dataCheckOpen: boolean | null;
  setDataCheckOpen: (open: boolean) => void;
  navigate: (route: Route) => void;
  /** Open a property; `target` = where its page lands (ADR 0118). */
  openProperty: (id: string, target?: PropertyTarget) => void;
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
  /** The sample was cleared: name the safety backup in the notice (ADR 0094) and open
   *  the Dashboard. */
  showSampleCleared: (safetyBackup: string) => void;
  dismissBackupHint: () => void;
  /** Some open form holds unsaved edits (UX-030): `unsavedSources` is not empty. */
  unsavedChanges: boolean;
  /** The open forms holding unsaved edits, one key per form, so a clean form never
   *  clears another form's flag. */
  unsavedSources: readonly string[];
  /** A navigation held back by `unsavedChanges`, waiting for Discard / Keep editing. */
  pendingLeave: (() => void) | null;
  /** The form whose edits `pendingLeave` drops, when it came from `guardedAction`; null
   *  for a navigation, which drops every form's edits. */
  pendingSource: string | null;
  /** Mark the form `source` as holding unsaved edits, or as clean. */
  setUnsavedChanges: (source: string, unsaved: boolean) => void;
  /** Run `fn` now, or, while the form `source` holds unsaved edits, hold it back for the
   *  leave guard like a navigation (a row switch in a record panel, ADR 0142). */
  guardedAction: (source: string, fn: () => void) => void;
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
  if (s.unsavedChanges && moves)
    set({ pendingLeave: () => set(target), pendingSource: null });
  else set(target);
}

/** The pending toast dismissal; a newer toast restarts it (DR-058). */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

/** The language last passed to setLanguage, so a slower earlier load cannot win. */
let requestedLanguage: Language | null = null;

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
  propertyTarget: null,
  clearPropertyTarget: () => set({ propertyTarget: null }),
  toast: null,
  showToast: (message) => {
    clearTimeout(toastTimer);
    toastSeq += 1;
    set({ toast: { message, id: toastSeq } });
    toastTimer = setTimeout(() => set({ toast: null }), TOAST_MS);
  },
  notice: null,
  setNotice: (notice) => set({ notice }),
  dismissNotice: () => set({ notice: null }),
  failure: null,
  setFailure: (action, error) => set({ failure: { action, error } }),
  dismissFailure: () => set({ failure: null }),
  dataReplaced: () => set({ notice: null, failure: null, lastImport: null }),
  backupHintDismissed: false,
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
  dataCheckOpen: null,
  setDataCheckOpen: (dataCheckOpen) => set({ dataCheckOpen }),
  unsavedChanges: false,
  unsavedSources: [],
  pendingLeave: null,
  pendingSource: null,
  navigate: (route) => guarded(get, set, { route }),
  openProperty: (id, target) =>
    guarded(get, set, {
      route: "property",
      selectedPropertyId: id,
      propertyTarget: target ?? null,
    }),
  setMode: (mode) => set({ mode }),
  setTheme: (theme) => {
    persist(THEME_KEY, theme);
    set({ theme });
  },
  setLanguage: (language) => {
    // Show a language only once its dictionary has loaded (DR-009): the UI keeps the
    // current one meanwhile, and the last choice wins when loads finish out of order.
    requestedLanguage = language;
    const apply = () => {
      if (requestedLanguage !== language) return;
      persist(LANGUAGE_KEY, language);
      set({ language });
    };
    if (isDictionaryLoaded(language)) apply();
    else
      loadDictionary(language).then(apply, (error: unknown) => {
        console.error(`Could not load the "${language}" dictionary:`, error);
      });
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
    set({ notice: { kind: "sampleCleared", file: safetyBackup } });
    guarded(get, set, { route: "dashboard" });
  },
  dismissBackupHint: () => set({ backupHintDismissed: true }),
  setUnsavedChanges: (source, unsaved) => {
    const others = get().unsavedSources.filter((k) => k !== source);
    const unsavedSources = unsaved ? [...others, source] : others;
    set({ unsavedSources, unsavedChanges: unsavedSources.length > 0 });
  },
  guardedAction: (source, fn) => {
    if (get().unsavedSources.includes(source))
      set({ pendingLeave: fn, pendingSource: source });
    else fn();
  },
  confirmLeave: () => {
    const { pendingLeave: go, pendingSource: source, unsavedSources } = get();
    // A guarded action drops only its own form's edits; the other forms stay open with
    // theirs (ADR 0142). A navigation leaves them all.
    const kept = source ? unsavedSources.filter((k) => k !== source) : [];
    set({
      unsavedChanges: kept.length > 0,
      unsavedSources: kept,
      pendingLeave: null,
      pendingSource: null,
    });
    go?.();
  },
  cancelLeave: () => set({ pendingLeave: null, pendingSource: null }),
}));

// Amounts are always Kč (UX-017); drop a currency picked in an older version.
clearLegacyCurrency();

/** Load the saved language's dictionary before the first render (src/main.tsx, DR-009).
 *  If it fails, show English for this session; the saved choice is kept. */
export async function loadStartupDictionary(): Promise<void> {
  const language = useUiStore.getState().language;
  try {
    await loadDictionary(language);
  } catch (error) {
    console.error(`Could not load the "${language}" dictionary:`, error);
    await loadDictionary("en");
    useUiStore.setState({ language: "en" });
  }
}
