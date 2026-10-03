/** True inside the Tauri desktop app (its IPC bridge is on `window`); false in a plain
 *  browser (E2E, ux:capture) and in Node tests. One check for every caller (DR-081). */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as Record<string, unknown>)["__TAURI_INTERNALS__"]
  );
}
