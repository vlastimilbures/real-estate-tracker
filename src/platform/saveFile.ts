// The one way the app hands a generated file to the user (DR-088, DR-112): the app's
// `save_file` command in the app, a browser blob download only outside Tauri (dev/E2E).
// Rust opens the save dialog, writes a temp file renamed into place and reads it back
// (src-tauri/src/files.rs, D-64), so `saved` means the file on disk is right; a
// cancelled dialog is `cancelled` (the user's own choice, no message).
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";
import {
  SaveFileError,
  type SaveFileOptions,
  type SaveOutcome,
} from "./saveFileTypes";

export { SaveFileError, type SaveFileOptions, type SaveOutcome };

function download({ filename, data, mime }: SaveFileOptions): SaveOutcome {
  const part = typeof data === "string" ? data : new Uint8Array(data);
  const url = URL.createObjectURL(new Blob([part], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking in the same tick can cancel the download in some engines (DR-088).
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { kind: "downloaded", filename };
}

export async function saveFile(opts: SaveFileOptions): Promise<SaveOutcome> {
  if (!isTauri()) return download(opts);
  const { filename, data, filter } = opts;
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const options = JSON.stringify({
    filename,
    filterName: filter.name,
    extensions: filter.extensions,
  });
  try {
    return await invoke<SaveOutcome>("save_file", body, {
      headers: { "x-save-options": encodeURIComponent(options) },
    });
  } catch (e) {
    throw new SaveFileError(e);
  }
}
