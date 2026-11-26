// The native menu, as the webview sees it: the pages View ▸ lists (⌘1–⌘5) with their
// labels, and the events the menu sends. The Rust menu (src-tauri/src/menu.rs, `ITEMS`)
// builds the same items; MenuRoutesInSync.test.ts checks the ids and events match.
import type { Route } from "../../state/uiStore";
import type { Dictionary } from "../../i18n";

type MenuDict = Pick<Dictionary, "menu" | "nav">;

/** View ▸ pages in left-bar order, each with its label in the UI language. */
const MENU_PAGES = [
  { route: "dashboard", label: (t: MenuDict) => t.nav.dashboard },
  { route: "properties", label: (t: MenuDict) => t.nav.properties },
  { route: "projections", label: (t: MenuDict) => t.nav.projections },
  { route: "scenarios", label: (t: MenuDict) => t.nav.scenarios },
  { route: "import", label: (t: MenuDict) => t.nav.importData },
] as const satisfies readonly {
  route: Route;
  label: (t: MenuDict) => string;
}[];

type MenuPage = (typeof MENU_PAGES)[number]["route"];

/** The events the native menu sends; `navigate` carries a View ▸ page. */
export const MENU_EVENTS = {
  about: "menu://about",
  navigate: "menu://navigate",
  newProperty: "menu://new-property",
  settings: "menu://settings",
} as const;

/** The page a View menu event asks for, or null for anything else. */
export function menuRoute(payload: unknown): Route | null {
  return MENU_PAGES.find((p) => p.route === payload)?.route ?? null;
}

/** Labels of the native menu items the app adds, in the UI language. Sent to the Rust
 *  shell, which checks them (src-tauri/src/menu.rs). Keys follow the View pages. */
export function menuLabels(t: MenuDict) {
  return {
    about: t.menu.about,
    settings: t.menu.settings,
    newProperty: t.menu.newProperty,
    pages: Object.fromEntries(
      MENU_PAGES.map((p) => [p.route, p.label(t)]),
    ) as Record<MenuPage, string>,
  };
}
