// Screen manifest for the UX capture run. One entry = one user-visible state; `run`
// drives the app there through the UI and calls `ux.capture()` (PNG + axe scan under the
// screen's id; an extra state passes its own id). To add a screen: add a `defineScreen`
// entry with a free id. The id's leading number groups screens by area (0x dashboard,
// 1x properties, 2x property detail, …); the order of this list is the flow order and
// need not match the file order.
import type { Route } from "../../src/state/uiStore";
import { LAYOUT_SCREENS } from "../layoutScreens";
import type { Screen } from "./define";
import { bootScreens } from "./boot";
import { dashboardScreens } from "./dashboard";
import { propertiesScreens } from "./properties";
import { propertyDetailScreens } from "./propertyDetail";
import { financingScreens } from "./financing";
import { propertyRecordsScreens } from "./propertyRecords";
import { projectionsScenariosScreens } from "./projectionsScenarios";
import { importScreens } from "./import";
import { settingsScreens } from "./settings";
import { guideEmptyScreens } from "./guideEmpty";
import { keyboardScreens } from "./keyboard";

/** Every screen in flow order: the area files concatenated. */
export const SCREENS: Screen[] = [
  ...bootScreens,
  ...dashboardScreens,
  ...propertiesScreens,
  ...propertyDetailScreens,
  ...financingScreens,
  ...propertyRecordsScreens,
  ...projectionsScenariosScreens,
  ...importScreens,
  ...settingsScreens,
  ...guideEmptyScreens,
  ...keyboardScreens,
];

// A renamed or removed layout screen would silently drop out of the Czech / Russian run
// (`--grep @layout-i18n`), and an id listed twice would make the list longer than that
// run: fail the whole capture run at load instead.
const missing = LAYOUT_SCREENS.filter(
  (id) => !SCREENS.some((s) => s.id === id),
);
if (missing.length > 0)
  throw new Error(
    `layoutScreens.ts names screens that do not exist: ${missing.join(", ")}`,
  );
const listedTwice = LAYOUT_SCREENS.filter(
  (id, i) => LAYOUT_SCREENS.indexOf(id) !== i,
);
if (listedTwice.length > 0)
  throw new Error(
    `layoutScreens.ts lists screens twice: ${listedTwice.join(", ")}`,
  );

/** Every route must have at least one capture; a new Route fails typecheck here. */
export const ROUTE_COVERAGE = {
  dashboard: "01-dashboard",
  properties: "10-properties",
  property: "20-property-detail",
  projections: "30-projections",
  scenarios: "40-scenarios",
  import: "50-import",
  settings: "60-settings-assumptions",
  guide: "70-guide",
} satisfies Record<Route, string>;
