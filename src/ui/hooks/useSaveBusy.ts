import { useBusyFocus } from "./useBusyFocus";

/**
 * A form save's busy flag, which also keeps a keyboard user's place (ADR 0246).
 *
 * While the save runs the form disables its submit button, and a focused button that
 * disables drops focus to `<body>`. When the save ends with a failure shown (a field
 * error or the form-level message, read from the form's own state), the control that
 * had focus when the save started gets it back, but only while focus is on `<body>` or
 * still on that control: focus the user moved elsewhere stays there. A save that
 * succeeds leaves focus to the form's own rule. Built on `useBusyFocus` (ADR 0248 §6).
 */
export function useSaveBusy(
  fieldErrors: Readonly<Record<string, string | undefined>>,
  formError: string | null,
): [boolean, (busy: boolean) => void] {
  const failed =
    formError !== null || Object.values(fieldErrors).some((e) => e);
  return useBusyFocus((el) => (failed ? el : null));
}
