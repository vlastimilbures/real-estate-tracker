// UI-only state: what the app shows and how (navigation, the lens and the display
// preferences, the open panels), and the one-off requests and messages the shell passes
// to a page (a menu command, toasts, notices, failures). No business logic here. The
// facade of state/ui, whose slices hold each concern.
import { loadDictionary } from "../i18n";
import { useUiStore } from "./ui/store";

export { useUiStore } from "./ui/store";
export type { Route, RouteRequest, SettingsTab } from "./navigation";
export type { Theme } from "./themePreference";
export type { OutcomeAction, Notice, Failure } from "./ui/feedback";
/** How long a toast stays.
 *  @internal test seam: tests reach it through the state facade (ADR 0072). */
export { TOAST_MS } from "./ui/feedback";
export { MAX_COMPARE } from "./ui/compare";
/** Some open form holds unsaved edits: derived from the sources, never stored.
 *  @internal test seam: the guard reads it inside the store (ADR 0072). */
export { hasUnsavedChanges } from "./ui/leaveGuard";

/** Load the saved language's dictionary before the first render (src/main.tsx).
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
