// What the app remembers across page frames and chromes for its lifetime. A page change
// mounts the page's frame again (PageFrame), and the chrome mounts again when the app
// comes back to the ready state (AppLayout; ADR 0263), so neither can hold it; it lives
// here, in the state layer, rather than as module state in src/ui (#491).
import type { Route } from "./uiStore";

let shownRoute: Route | null = null;

/** Records `route` as the one the content column shows; returns the route it showed
 *  before (null at startup), also across a remount of the chrome. */
export function swapShownRoute(route: Route): Route | null {
  const before = shownRoute;
  shownRoute = route;
  return before;
}

/** The kept banners already shown on some page (ADR 0189, ADR 0194). By identity: the
 *  store makes a new object for every notice, failure and edit error, so a repeat is
 *  announced again. */
const shown = new WeakSet<object>();

export const wasShown = (item: object): boolean => shown.has(item);

export function markShown(item: object): void {
  shown.add(item);
}
