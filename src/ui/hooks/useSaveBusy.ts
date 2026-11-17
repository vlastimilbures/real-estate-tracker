import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * A form save's busy flag, which also keeps a keyboard user's place (ADR 0246).
 *
 * While the save runs the form disables its submit button, and a focused button that
 * disables drops focus to `<body>`. When the save ends with a failure shown (a field
 * error or the form-level message, read from the form's own state), the control that
 * had focus when the save started gets it back, but only while focus is on `<body>` or
 * still on that control: focus the user moved elsewhere stays there. A save that
 * succeeds leaves focus to the form's own rule.
 */
export function useSaveBusy(
  fieldErrors: Readonly<Record<string, string | undefined>>,
  formError: string | null,
): [boolean, (busy: boolean) => void] {
  const [busy, setBusyState] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const ended = useRef(false);
  const failed =
    formError !== null || Object.values(fieldErrors).some((e) => e);

  const setBusy = useCallback((next: boolean) => {
    if (next) {
      const active = document.activeElement;
      trigger.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
    }
    ended.current = !next;
    setBusyState(next);
  }, []);

  // After the commit that ended the save: the button is enabled again by then.
  useLayoutEffect(() => {
    if (busy || !ended.current) return;
    ended.current = false;
    const el = trigger.current;
    const active = document.activeElement;
    const lost = !active || active === document.body || active === el;
    if (failed && el?.isConnected && lost) el.focus();
  }, [busy, failed]);

  return [busy, setBusy];
}
