// Native menu → page (UX-066, DR-143). The View menu (⌘1–⌘5) sends a page name with
// `menu://navigate`; only the pages it lists are accepted.
import type { Route } from "../../state/uiStore";
import type { Dictionary } from "../../i18n";

const MENU_ROUTES = [
  "dashboard",
  "properties",
  "projections",
  "scenarios",
  "import",
] as const satisfies readonly Route[];

/** The page a View menu event asks for, or null for anything else. */
export function menuRoute(payload: unknown): Route | null {
  return MENU_ROUTES.find((r) => r === payload) ?? null;
}

/** Labels of the native menu items the app adds, in the UI language (UX-076). Sent to
 *  the Rust shell, which checks them (src-tauri/src/menu.rs). Keys follow its View pages. */
export function menuLabels(t: Pick<Dictionary, "menu" | "nav">) {
  return {
    about: t.menu.about,
    settings: t.menu.settings,
    newProperty: t.menu.newProperty,
    pages: {
      dashboard: t.nav.dashboard,
      properties: t.nav.properties,
      projections: t.nav.projections,
      scenarios: t.nav.scenarios,
      import: t.nav.importData,
    } satisfies Record<(typeof MENU_ROUTES)[number], string>,
  };
}
