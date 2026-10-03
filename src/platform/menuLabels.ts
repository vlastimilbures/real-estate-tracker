// Native menu language (UX-076): sends the labels of the app's own menu items to the
// `set_menu_labels` command (src-tauri/src/menu.rs). Fire-and-forget: a refused label
// leaves the previous text, and the menu still works.
import { invoke } from "@tauri-apps/api/core";

export interface NativeMenuLabels {
  about: string;
  settings: string;
  newProperty: string;
  pages: Record<string, string>;
}

export function setMenuLabels(labels: NativeMenuLabels): void {
  invoke("set_menu_labels", { labels }).catch(() => undefined);
}
