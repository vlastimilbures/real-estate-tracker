// Native menu events (App ▸ About…, View ▸ ⌘1–⌘5, File ▸ New Property…) emitted by the
// Rust menu (src-tauri/src/menu.rs). Callers guard with `isTauri()`: the event bridge
// does not exist in a plain browser (E2E, ux:capture).
import {
  listen,
  type EventCallback,
  type UnlistenFn,
} from "@tauri-apps/api/event";

export function onMenuEvent<T = unknown>(
  event: `menu://${string}`,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  return listen<T>(event, handler);
}
