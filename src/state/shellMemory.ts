// What the app remembers across page frames for its lifetime. A page change mounts the
// page's frame again (PageFrame; ADR 0263), so it cannot hold it; it lives here, in the
// state layer, rather than as module state in src/ui (#491).

/** The kept banners already shown on some page (ADR 0189, ADR 0194). By identity: the
 *  store makes a new object for every notice, failure and edit error, so a repeat is
 *  announced again. */
const shown = new WeakSet<object>();

export const wasShown = (item: object): boolean => shown.has(item);

export function markShown(item: object): void {
  shown.add(item);
}
