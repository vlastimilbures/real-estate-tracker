// The Import session (ADR 0096, ADR 0240): one test per event, and the named phase and
// facts derived from each state. A preview, its failure and the confirm hold for the
// inputs they were made for: the chosen files and the store's data and preview action.
import { describe, it, expect } from "vitest";
import type { CsvImportPreview, ImportItem } from "../../../state/csv";
import type { WriteError } from "../../../state/writeError";
import {
  importBatch,
  importSession,
  initialImportSession,
  sessionView,
  type Basis,
  type FileState,
  type ImportEvent,
  type ImportSession,
  type StoreBasis,
} from "../importSession";

const item = (
  kind: ImportItem["kind"],
  extra: Partial<ImportItem> = {},
): ImportItem => ({
  file: "properties",
  row: 2,
  kind,
  propertyId: "p",
  propertyName: "P",
  date: null,
  changes: [],
  ...extra,
});
const plan = (
  items: ImportItem[],
  problems: CsvImportPreview["problems"] = [],
) => ({
  items,
  problems,
});
const refused = plan(
  [],
  [
    {
      file: "rents",
      row: 2,
      field: "property_name",
      problem: { code: "unknownProperty", value: "Nope" },
    },
  ],
);
const error: WriteError = { kind: "unknown", message: "disk" } as never;

const okFile = (rows = 1): FileState<never> => ({
  name: "properties.csv",
  result: { rows: Array.from({ length: rows }) as never[], errors: [] },
});
const badFile: FileState<never> = {
  name: "properties.csv",
  result: {
    rows: [],
    errors: [{ row: 2, field: "name", error: { code: "required" } }],
  },
};

const store: StoreBasis = { portfolio: {}, previewCsv: () => {} };
const otherStore: StoreBasis = { ...store, portfolio: {} };

/** The session after `events`, from the start. */
const after = (...events: ImportEvent[]) =>
  events.reduce(importSession, initialImportSession);
const chosen = (file: FileState<never> = okFile()): ImportEvent => ({
  type: "fileChosen",
  kind: "properties",
  file,
});
const basisOf = (s: ImportSession, st: StoreBasis = store): Basis => ({
  ...st,
  files: s.files,
});
/** The event that delivers `preview` for the session's current inputs. */
const arrived = (s: ImportSession, preview: CsvImportPreview): ImportEvent => ({
  type: "previewArrived",
  basis: basisOf(s),
  preview,
});
const view = (s: ImportSession, importing = false, st = store) =>
  sessionView(s, st, importing);

/** A session with one valid file whose preview is `preview`. */
function previewed(preview: CsvImportPreview) {
  const s = after(chosen());
  return importSession(s, arrived(s, preview));
}

describe("importSession events", () => {
  it("fileChosen keeps the file by its type and drops the preview, failure and confirm", () => {
    const s0 = previewed(plan([item("update")]));
    const asked = importSession(s0, {
      type: "confirmAsked",
      basis: basisOf(s0),
    });
    const s = importSession(asked, chosen(okFile(2)));
    expect(s.files.properties?.result.rows).toHaveLength(2);
    expect(s.preview).toBeNull();
    expect(s.previewFailure).toBeNull();
    expect(s.confirming).toBeNull();
    expect(
      importSession(s, { type: "fileChosen", kind: "rents", file: okFile() })
        .files,
    ).toEqual({ properties: s.files.properties, rents: okFile() });
  });

  it("previewArrived keeps the preview for its inputs", () => {
    const s = previewed(plan([item("add")]));
    expect(s.preview?.value).toEqual(plan([item("add")]));
    expect(s.preview?.basis.files).toBe(s.files);
  });

  it("previewFailed drops the preview and keeps why", () => {
    const s0 = previewed(plan([item("add")]));
    const s = importSession(s0, {
      type: "previewFailed",
      basis: basisOf(s0),
      error,
    });
    expect(s.preview).toBeNull();
    expect(s.previewFailure?.value).toBe(error);
  });

  it("confirmAsked and confirmCancelled open and close the confirm", () => {
    const s0 = previewed(plan([item("update")]));
    const s = importSession(s0, { type: "confirmAsked", basis: basisOf(s0) });
    expect(s.confirming).toEqual(basisOf(s0));
    expect(
      importSession(s, { type: "confirmCancelled" }).confirming,
    ).toBeNull();
  });

  it("importStarted closes the confirm and keeps the preview", () => {
    const s0 = previewed(plan([item("update")]));
    const asked = importSession(s0, {
      type: "confirmAsked",
      basis: basisOf(s0),
    });
    const s = importSession(asked, { type: "importStarted" });
    expect(s.confirming).toBeNull();
    expect(s.preview).toBe(s0.preview);
  });

  it("importDone clears every file and what was shown for them", () => {
    const s = importSession(previewed(plan([item("add")])), {
      type: "importDone",
    });
    expect(s).toEqual(initialImportSession);
  });

  it("importRefused shows the refused plan for the files and the store as it is now", () => {
    const s0 = previewed(plan([item("add")]));
    const s = importSession(s0, {
      type: "importRefused",
      store: otherStore,
      preview: refused,
    });
    expect(s.preview).toEqual({
      value: refused,
      basis: basisOf(s0, otherStore),
    });
  });

  it("storeChanged drops what was made for another store, and nothing else", () => {
    const s0 = previewed(plan([item("update")]));
    const asked = importSession(s0, {
      type: "confirmAsked",
      basis: basisOf(s0),
    });
    expect(importSession(asked, { type: "storeChanged", store })).toBe(asked);
    const s = importSession(asked, { type: "storeChanged", store: otherStore });
    expect(s.files).toBe(asked.files);
    expect(s.preview).toBeNull();
    expect(s.confirming).toBeNull();
    const failed = importSession(after(chosen()), {
      type: "previewFailed",
      basis: basisOf(after(chosen())),
      error,
    });
    expect(
      importSession(failed, { type: "storeChanged", store: otherStore })
        .previewFailure,
    ).toBeNull();
  });
});

describe("sessionView: the phase and what Import offers", () => {
  const counts = { added: 1, updated: 0, replacing: 0 };
  it.each<[string, () => ImportSession, boolean, string, boolean]>([
    ["no file", () => initialImportSession, false, "noFile", false],
    [
      "a file with errors",
      () => after(chosen(badFile)),
      false,
      "fileErrors",
      false,
    ],
    ["the preview running", () => after(chosen()), false, "previewing", false],
    [
      "the preview failed",
      () => {
        const s = after(chosen());
        return importSession(s, {
          type: "previewFailed",
          basis: basisOf(s),
          error,
        });
      },
      false,
      "previewFailed",
      false,
    ],
    ["a refused plan", () => previewed(refused), false, "planRefused", false],
    [
      "nothing to write",
      () => previewed(plan([item("unchanged")])),
      false,
      "nothingToImport",
      false,
    ],
    [
      "a plan to write",
      () => previewed(plan([item("add")])),
      false,
      "ready",
      true,
    ],
    [
      "the confirm open",
      () => {
        const s = previewed(plan([item("update")]));
        return importSession(s, { type: "confirmAsked", basis: basisOf(s) });
      },
      false,
      "confirming",
      true,
    ],
    [
      "importing",
      () => previewed(plan([item("add")])),
      true,
      "importing",
      false,
    ],
  ])("%s", (_name, make, importing, phase, canImport) => {
    const v = view(make(), importing);
    expect(v.phase).toBe(phase);
    expect(v.canImport).toBe(canImport);
  });

  it("counts what the plan writes", () => {
    const v = view(previewed(plan([item("add"), item("unchanged")])));
    expect(v.counts).toEqual(counts);
    expect(v.toWrite).toBe(1);
    expect(v.planOk).toBe(true);
  });

  it("counts an added block that replaces stored events (ADR 0160)", () => {
    const v = view(previewed(plan([item("add", { replaces: [{} as never] })])));
    expect(v.counts).toEqual({ ...counts, replacing: 1 });
  });

  it("ignores what was made for other inputs, until storeChanged drops it", () => {
    const s0 = previewed(plan([item("update")]));
    const s = importSession(s0, { type: "confirmAsked", basis: basisOf(s0) });
    const v = view(s, false, otherStore);
    expect(v.preview).toBeNull();
    expect(v.confirming).toBe(false);
    expect(v.phase).toBe("previewing");
    expect(view(s).phase).toBe("confirming");
    const failed = importSession(after(chosen()), {
      type: "previewFailed",
      basis: basisOf(after(chosen())),
      error,
    });
    expect(view(failed, false, otherStore).previewFailure).toBeNull();
  });

  it("keeps an earlier file's preview out of a later file's session", () => {
    const s0 = after(chosen());
    const stale = arrived(s0, plan([item("add")]));
    const s = importSession(importSession(s0, chosen(okFile(2))), stale);
    expect(view(s).preview).toBeNull();
  });
});

describe("importBatch", () => {
  it("is each type's rows, undefined for a type without a file", () => {
    const s = after(chosen(okFile(2)));
    expect(importBatch(s.files)).toEqual({
      properties: s.files.properties?.result.rows,
      valuations: undefined,
      rents: undefined,
      mortgages: undefined,
    });
  });
});
