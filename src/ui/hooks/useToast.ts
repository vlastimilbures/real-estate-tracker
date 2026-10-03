import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 2200;

/** Transient toast message: shows `msg`, then clears itself after `durationMs`. A newer
 *  toast restarts the timer, and unmounting cancels it (DR-058). */
export function useToast(durationMs = DEFAULT_DURATION_MS) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const showToast = useCallback(
    (msg: string) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(msg);
      timer.current = setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  return { toast, showToast };
}
