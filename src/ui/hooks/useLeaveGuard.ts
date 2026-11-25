import { useEffect } from "react";
import { useUiStore } from "../../state/uiStore";

/**
 * Register a form's unsaved edits with the leave guard (UX-030, UX-073): while `dirty`,
 * a navigation through the guard asks first. The form is known under `key`, so a clean
 * form never clears another form's flag; a key change or an unmount unregisters it.
 */
export function useLeaveGuard(key: string, dirty: boolean): void {
  const setUnsavedChanges = useUiStore((s) => s.setUnsavedChanges);
  useEffect(() => {
    setUnsavedChanges(key, dirty);
  }, [key, dirty, setUnsavedChanges]);
  useEffect(
    () => () => setUnsavedChanges(key, false),
    [key, setUnsavedChanges],
  );
}
