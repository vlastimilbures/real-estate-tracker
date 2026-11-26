// The app's pages: one row per route. The left bar, the page switch and the page
// boundary's fallback title read this table; a route without a row fails tsc. The native
// View menu keeps its own list (model/menu.ts): it mirrors src-tauri/src/menu.rs.
import { lazy, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  LineChart,
  GitCompareArrows,
  Upload,
  Settings,
  BookOpen,
} from "lucide-react";
import type { Route } from "../state/uiStore";
import type { Dictionary } from "../i18n";
import { Dashboard } from "./pages/Dashboard";
import { Properties } from "./pages/Properties";

// Pages away from the start screen load on first visit: their code, and the libraries
// only they use, stay out of the startup bundle. The fallback is empty; the chunk is a
// local file, so the gap is a few milliseconds (ADR 0066).
const PropertyDetail = lazy(() =>
  import("./pages/PropertyDetail").then((m) => ({ default: m.PropertyDetail })),
);
const Projections = lazy(() =>
  import("./pages/Projections").then((m) => ({ default: m.Projections })),
);
const Scenarios = lazy(() =>
  import("./pages/Scenarios").then((m) => ({ default: m.Scenarios })),
);
const Import = lazy(() =>
  import("./pages/Import").then((m) => ({ default: m.Import })),
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.SettingsPage })),
);
const Guide = lazy(() =>
  import("./pages/Guide").then((m) => ({ default: m.Guide })),
);

/** A page's button in the left bar, in one of its two groups (ADR 0219): the pages on
 *  top, the tools above the footer. */
interface NavEntry {
  group: "pages" | "tools";
  navKey: keyof Dictionary["nav"];
  icon: LucideIcon;
}

interface RouteSpec {
  /** The page; it renders its own PageFrame. */
  page: ComponentType;
  /** The title the page boundary's fallback shows (ADR 0146). */
  title: (t: Dictionary) => string;
  /** Its left-bar button, or null for a page reached from another one. */
  nav: NavEntry | null;
  /** The page whose left-bar button is marked while this one shows, if not its own. */
  under?: Route;
}

/** Every page, in left-bar order. */
export const ROUTES: Readonly<Record<Route, RouteSpec>> = {
  dashboard: {
    page: Dashboard,
    title: (t) => t.dashboard.title,
    nav: { group: "pages", navKey: "dashboard", icon: LayoutDashboard },
  },
  properties: {
    page: Properties,
    title: (t) => t.properties.title,
    nav: { group: "pages", navKey: "properties", icon: Building2 },
  },
  // Property detail falls under Properties: its button is marked, its fallback says so.
  property: {
    page: PropertyDetail,
    title: (t) => t.properties.title,
    nav: null,
    under: "properties",
  },
  projections: {
    page: Projections,
    title: (t) => t.projections.title,
    nav: { group: "pages", navKey: "projections", icon: LineChart },
  },
  scenarios: {
    page: Scenarios,
    title: (t) => t.scenarios.title,
    nav: { group: "pages", navKey: "scenarios", icon: GitCompareArrows },
  },
  import: {
    page: Import,
    title: (t) => t.importPage.title,
    nav: { group: "tools", navKey: "importData", icon: Upload },
  },
  settings: {
    page: SettingsPage,
    title: (t) => t.settings.title,
    nav: { group: "tools", navKey: "settings", icon: Settings },
  },
  guide: {
    page: Guide,
    title: (t) => t.guide.title,
    nav: { group: "tools", navKey: "guide", icon: BookOpen },
  },
};

/** One left-bar button. */
interface NavItem extends NavEntry {
  route: Route;
}

const ROUTE_LIST = Object.keys(ROUTES) as Route[];

/** The left bar's two groups, each in table order. */
export const NAV_GROUPS: readonly (readonly NavItem[])[] = (
  ["pages", "tools"] as const
).map((group) =>
  ROUTE_LIST.flatMap((route) => {
    const nav = ROUTES[route].nav;
    return nav?.group === group ? [{ route, ...nav }] : [];
  }),
);

/** Whether the left-bar button for `button` is marked while `route` shows. */
export const navMarked = (route: Route, button: Route): boolean =>
  (ROUTES[route].under ?? route) === button;
