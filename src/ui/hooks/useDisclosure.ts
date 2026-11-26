// A disclosure's open state (ADR 0203): its own, or its caller's.
import { useId, useState } from "react";

export interface OpenState {
  /** Controlled: the open state, kept by the caller with `onOpenChange`. */
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Uncontrolled: read when it mounts; key it by the default to follow a change. */
  defaultOpen?: boolean | undefined;
}

/** A disclosure's open state, its own or its caller's, and the id of the region it
 *  shows: for a disclosure whose button and region are laid out apart (two grid cells). */
export function useDisclosure({
  open,
  onOpenChange,
  defaultOpen = false,
}: OpenState) {
  const [own, setOwn] = useState(defaultOpen);
  const id = useId();
  const shown = open ?? own;
  const toggle = () => {
    if (open === undefined) setOwn(!shown);
    onOpenChange?.(!shown);
  };
  return { open: shown, id, toggle };
}
