import { useEffect, useState } from "react";
import { markShown, wasShown } from "../../state/shellMemory";

/** True only on the page where `item` first shows: each page mounts its own shell, and a
 *  kept banner is announced once, then stays silent (ADR 0189, ADR 0194). False for null. */
export function useFirstShow(item: object | null): boolean {
  const [mine, setMine] = useState(() =>
    item === null || wasShown(item) ? null : item,
  );
  // A newer item on this page is shown here first.
  if (item !== null && mine !== item && !wasShown(item)) setMine(item);
  useEffect(() => {
    if (item !== null) markShown(item);
  }, [item]);
  return item !== null && mine === item;
}
