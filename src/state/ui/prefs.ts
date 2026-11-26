// The display preferences: the lens, the theme, the language and the collapsed sidebar.
// The theme, the language and the sidebar persist in localStorage; the lens does not.
import { isDictionaryLoaded, loadDictionary } from "../../i18n";
import type { Language } from "../../i18n/types";
import type { Mode } from "../navigation";
import { THEME_KEY, readPersistedTheme, type Theme } from "../themePreference";
import type { SliceCtx } from "./types";

const COLLAPSE_KEY = "ui.sidebarCollapsed";
const LANGUAGE_KEY = "ui.language";

function readLanguage(): Language {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY);
    if (v === "en" || v === "cs" || v === "ru") return v;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return "en";
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

export interface PrefsSlice {
  mode: Mode;
  /** Appearance preference; resolved + applied to <html> in src/ui/theme.ts. */
  theme: Theme;
  /** UI language. Persisted. Drives the i18n dictionary in src/i18n. */
  language: Language;
  /** Left nav collapsed to an icon-only rail. Persisted. */
  sidebarCollapsed: boolean;
  setMode: (mode: Mode) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  toggleSidebar: () => void;
}

/** The language last passed to setLanguage, so a slower earlier load cannot win. */
let requestedLanguage: Language | null = null;

export function prefsSlice({ set, get }: SliceCtx): PrefsSlice {
  return {
    mode: "nominal",
    theme: readPersistedTheme(),
    language: readLanguage(),
    sidebarCollapsed: readCollapsed(),
    setMode: (mode) => set({ mode }),
    setTheme: (theme) => {
      persist(THEME_KEY, theme);
      set({ theme });
    },
    setLanguage: (language) => {
      // Show a language only once its dictionary has loaded: the UI keeps the current
      // one meanwhile, and the last choice wins when loads finish out of order.
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
    toggleSidebar: () => {
      const next = !get().sidebarCollapsed;
      persist(COLLAPSE_KEY, String(next));
      set({ sidebarCollapsed: next });
    },
  };
}
