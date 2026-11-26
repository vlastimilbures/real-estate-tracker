// The Import page's session (ADR 0096, ADR 0240): the chosen files by type, the preview
// of what they would do, why it failed, and the overwrite confirm. Every transition is
// an event below.
//
// A preview, its failure and the confirm each hold for the inputs they were made for (a
// `Basis`): the chosen files, the stored data and the store's preview action. When any
// of these changes they no longer count, at once, so Import waits for the new preview
// without any state being set during render. `storeChanged` then drops them.
// Whether a run is in progress is not kept here: the page's busy focus owns it (ADR 0248).
import type {
  CsvFile,
  CsvImportPreview,
  CsvParseResult,
  ParsedMortgageRow,
  ParsedPropertyRow,
  ParsedRentRow,
  ParsedValuationRow,
} from "../../state/csv";
import type { WriteError } from "../../state/writeError";
import { importCounts } from "./importPreview";

/** The file types, in the page's order (ADR 0212). */
export const FILE_KINDS = [
  "properties",
  "valuations",
  "rents",
  "mortgages",
] as const satisfies readonly CsvFile[];
export type FileKind = (typeof FILE_KINDS)[number];

interface RowsOf {
  properties: ParsedPropertyRow;
  valuations: ParsedValuationRow;
  rents: ParsedRentRow;
  mortgages: ParsedMortgageRow;
}

/** A chosen file: its name and what parsing it gave. */
export interface FileState<T> {
  name: string;
  result: CsvParseResult<T>;
}

export type ImportFiles = { readonly [K in FileKind]?: FileState<RowsOf[K]> };
type ChosenFile = {
  [K in FileKind]: { kind: K; file: FileState<RowsOf[K]> };
}[FileKind];

/** The store's part of a preview's inputs; compared by identity. */
export interface StoreBasis {
  readonly portfolio: unknown;
  readonly previewCsv: unknown;
}
/** All of a preview's inputs. */
export interface Basis extends StoreBasis {
  readonly files: ImportFiles;
}
interface For<T> {
  readonly value: T;
  readonly basis: Basis;
}

export interface ImportSession {
  readonly files: ImportFiles;
  readonly preview: For<CsvImportPreview> | null;
  readonly previewFailure: For<WriteError> | null;
  /** The inputs the overwrite confirm was asked for, while it is open. */
  readonly confirming: Basis | null;
}

export const initialImportSession: ImportSession = {
  files: {},
  preview: null,
  previewFailure: null,
  confirming: null,
};

export type ImportEvent =
  | ({ type: "fileChosen" } & ChosenFile)
  | { type: "previewArrived"; basis: Basis; preview: CsvImportPreview }
  | { type: "previewFailed"; basis: Basis; error: WriteError }
  | { type: "confirmAsked"; basis: Basis }
  | { type: "confirmCancelled" }
  | { type: "importStarted" }
  | { type: "importDone" }
  /** The plan built at the click has problems (ADR 0229 §2): shown as the preview is,
   *  for the files and the store as they are when the refusal arrives. */
  | { type: "importRefused"; store: StoreBasis; preview: CsvImportPreview }
  | { type: "storeChanged"; store: StoreBasis };

const sameStore = (a: StoreBasis, b: StoreBasis) =>
  a.portfolio === b.portfolio && a.previewCsv === b.previewCsv;
const sameBasis = (a: Basis, b: Basis) =>
  a.files === b.files && sameStore(a, b);

/** What the session holds for another store, dropped; the same session when none is. */
function dropOtherStore(s: ImportSession, store: StoreBasis): ImportSession {
  const keep = <T extends { basis: Basis } | null>(x: T) =>
    x && !sameStore(x.basis, store) ? null : x;
  const confirming =
    s.confirming && !sameStore(s.confirming, store) ? null : s.confirming;
  const next = {
    files: s.files,
    preview: keep(s.preview),
    previewFailure: keep(s.previewFailure),
    confirming,
  };
  const same =
    next.preview === s.preview &&
    next.previewFailure === s.previewFailure &&
    next.confirming === s.confirming;
  return same ? s : next;
}

export function importSession(s: ImportSession, e: ImportEvent): ImportSession {
  switch (e.type) {
    case "fileChosen":
      // Each file is parsed once, on its own. Whether a child row's property exists is
      // the import plan's check, at the preview and at the click (ADR 0254).
      return {
        ...initialImportSession,
        files: { ...s.files, [e.kind]: e.file },
      };
    case "previewArrived":
      return { ...s, preview: { value: e.preview, basis: e.basis } };
    case "previewFailed":
      return {
        ...s,
        preview: null,
        previewFailure: { value: e.error, basis: e.basis },
      };
    case "confirmAsked":
      return { ...s, confirming: e.basis };
    case "confirmCancelled":
    case "importStarted":
      return { ...s, confirming: null };
    case "importDone":
      // Imported: clear the files so a second click cannot import them again.
      return initialImportSession;
    case "importRefused":
      return {
        ...s,
        preview: { value: e.preview, basis: { ...e.store, files: s.files } },
      };
    case "storeChanged":
      return dropOtherStore(s, e.store);
  }
}

/** Whether any file is chosen. */
export const hasAnyFile = (files: ImportFiles) =>
  FILE_KINDS.some((k) => files[k] !== undefined);

/** Whether every chosen file parsed without errors. */
export const allValid = (files: ImportFiles) =>
  FILE_KINDS.every((k) => (files[k]?.result.errors.length ?? 0) === 0);

/** The chosen rows by type, as the preview and the import take them. */
export function importBatch(files: ImportFiles) {
  return {
    properties: files.properties?.result.rows,
    valuations: files.valuations?.result.rows,
    rents: files.rents?.result.rows,
    mortgages: files.mortgages?.result.rows,
  };
}

/** The session's named states, in the order they are checked. */
export type ImportPhase =
  | "noFile"
  | "fileErrors"
  | "previewing"
  | "previewFailed"
  | "planRefused"
  | "nothingToImport"
  | "importing"
  | "confirming"
  | "ready";

function phaseOf(
  files: ImportFiles,
  preview: CsvImportPreview | null,
  failed: boolean,
  toWrite: number,
  importing: boolean,
  confirming: boolean,
): ImportPhase {
  if (!hasAnyFile(files)) return "noFile";
  if (!allValid(files)) return "fileErrors";
  if (!preview) return failed ? "previewFailed" : "previewing";
  if (preview.problems.length > 0) return "planRefused";
  if (toWrite === 0) return "nothingToImport";
  if (importing) return "importing";
  return confirming ? "confirming" : "ready";
}

/** What the page shows for the session, with the store as it is now. Import can run in
 *  "ready" and, from its confirm, in "confirming". */
export function sessionView(
  s: ImportSession,
  store: StoreBasis,
  importing: boolean,
) {
  const now: Basis = { ...store, files: s.files };
  const live = <T>(x: For<T> | null) =>
    x && sameBasis(x.basis, now) ? x.value : null;
  const preview = live(s.preview);
  const previewFailure = live(s.previewFailure);
  const confirming = s.confirming !== null && sameBasis(s.confirming, now);
  const counts = importCounts(preview?.items ?? []);
  const toWrite = counts.added + counts.updated;
  const phase = phaseOf(
    s.files,
    preview,
    previewFailure !== null,
    toWrite,
    importing,
    confirming,
  );
  return {
    phase,
    preview,
    previewFailure,
    confirming,
    counts,
    toWrite,
    planOk: preview !== null && preview.problems.length === 0,
    canImport: phase === "ready" || phase === "confirming",
  };
}
