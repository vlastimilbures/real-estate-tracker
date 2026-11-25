// What the app remembers across page shells for its lifetime. Each page mounts its own
// AppShell (ADR 0146), so no shell can hold it; it lives here, in the state layer, rather
// than as module state in src/ui (#491).
import type { Route } from "./uiStore";

let shownRoute: Route | null = null;

/** Records `route` as the one the newest shell shows; returns the route the shell before
 *  it showed (null at startup). */
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
