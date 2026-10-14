import { useEffect, useState } from "react";

/** The kept banners already shown on some page. By identity: the store makes a new object
 *  for every notice, failure and edit error, so a repeat is announced again. */
const shown = new WeakSet<object>();

/** True only on the page where `item` first shows: each page mounts its own shell, and a
 *  kept banner is announced once, then stays silent (ADR 0189, ADR 0194). False for null. */
export function useFirstShow(item: object | null): boolean {
  const [mine, setMine] = useState(() =>
    item === null || shown.has(item) ? null : item,
  );
  // A newer item on this page is shown here first.
  if (item !== null && mine !== item && !shown.has(item)) setMine(item);
  useEffect(() => {
    if (item !== null) shown.add(item);
  }, [item]);
  return item !== null && mine === item;
}
