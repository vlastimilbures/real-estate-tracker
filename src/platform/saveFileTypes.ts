// What a file save returns or throws (see saveFile.ts). Kept apart from the Tauri call so
// the data layer can name the outcome and the error without importing the save itself
// (the store injects it, ADR 0072).
export type SaveOutcome =
  | { kind: "saved"; filename: string }
  | { kind: "downloaded"; filename: string }
  | { kind: "cancelled" };

/** The file could not be written (or did not read back as written). */
export class SaveFileError extends Error {
  /** The underlying failure, for display. */
  readonly detail: string;
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Could not save the file: ${detail}`, { cause });
    this.name = "SaveFileError";
    this.detail = detail;
  }
}

export interface SaveFileOptions {
  /** Suggested file name. */
  filename: string;
  data: string | Uint8Array;
  mime: string;
  /** Save-dialog filter, e.g. { name: "Excel workbook", extensions: ["xlsx"] }. */
  filter: { name: string; extensions: string[] };
}
