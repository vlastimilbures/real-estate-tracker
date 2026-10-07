// "Show data folder" on the startup error screen (#115, ADR 0153): the `reveal_data_dir`
// command (src-tauri/src/files.rs) shows the app folder in Finder, with the database
// selected. It takes no arguments: the folder is the app's own. Outside the desktop app
// (E2E, ux:capture) there is no folder to show, so it does nothing.
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

/** Rejects when Finder could not be asked to show the folder. */
export async function revealDataDir(): Promise<void> {
  if (!isTauri()) return;
  await invoke("reveal_data_dir");
}
