import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Where focus goes once a busy action ends: given the control that had focus when it
 *  started and the panel or dialog around it, an element, or null to leave focus alone. */
export type BusyFocusTarget = (
  trigger: HTMLElement,
  region: HTMLElement | null,
) => HTMLElement | null | undefined;

/**
 * Keep a keyboard user's place across a busy action (ADR 0248 §5–§6, ADR 0246).
 *
 * A button that disables while its action runs drops focus to `<body>`. Call the returned
 * `remember()` in the handler, before the busy flag is set: it records the focused
 * control and the `section.panel` or `[role=dialog]` around it. In the commit where
 * `busy` turns false, `target` names where focus goes; it is focused only when focus is
 * on `<body>` or still on the recorded control (focus the user moved stays there), and
 * only when it is on the page and enabled.
 */
export function useFocusAfterBusy(
  busy: boolean,
  target: BusyFocusTarget,
): () => void {
  const record = useRef<{
    trigger: HTMLElement;
    region: HTMLElement | null;
  } | null>(null);
  const wasBusy = useRef(busy);

  const remember = useCallback(() => {
    const active = document.activeElement;
    record.current =
      active instanceof HTMLElement && active !== document.body
        ? {
            trigger: active,
            region: active.closest<HTMLElement>("section.panel, [role=dialog]"),
          }
        : null;
  }, []);

  // After the commit that ended the action: its controls are enabled again by then.
  useLayoutEffect(() => {
    const ended = wasBusy.current && !busy;
    wasBusy.current = busy;
    const r = record.current;
    if (!ended || !r) return;
    record.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && active !== r.trigger) return;
    const el = target(r.trigger, r.region);
    if (el?.isConnected && !el.matches(":disabled")) el.focus();
  });

  return remember;
}

/** A busy flag whose `setBusy(true)` remembers the focused control (see above). */
export function useBusyFocus(
  target: BusyFocusTarget,
): [boolean, (busy: boolean) => void] {
  const [busy, setBusyState] = useState(false);
  const remember = useFocusAfterBusy(busy, target);
  const setBusy = useCallback(
    (next: boolean) => {
      if (next) remember();
      setBusyState(next);
    },
    [remember],
  );
  return [busy, setBusy];
}
