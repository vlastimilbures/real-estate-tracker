// saveFile in Tauri (mocked `save_file` command): honest outcomes, and a failure from
// Rust — including a file that does not read back as written (DR-112) — is a failure,
// not "saved". The write itself (temp + rename, read-back) is tested in
// src-tauri/tests/files.rs.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { saveFile, SaveFileError } from "../saveFile";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

const bytes = new Uint8Array([1, 2, 3]);
const opts = {
  filename: "x.xlsx",
  data: bytes,
  mime: "application/octet-stream",
  filter: { name: "Excel workbook", extensions: ["xlsx"] },
};

type Headers = { headers: Record<string, string> };

/** The dialog options sent in the `x-save-options` header. */
function sentOptions(call = 0): unknown {
  const [, , { headers }] = core.invoke.mock.calls[call] as [
    string,
    Uint8Array,
    Headers,
  ];
  return JSON.parse(decodeURIComponent(headers["x-save-options"]));
}

beforeEach(() => {
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  core.invoke.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("saveFile", () => {
  it("cancelled dialog: cancelled", async () => {
    core.invoke.mockResolvedValue({ kind: "cancelled" });
    expect(await saveFile(opts)).toEqual({ kind: "cancelled" });
  });

  it("saved: the bytes and the dialog options go to save_file", async () => {
    core.invoke.mockResolvedValue({ kind: "saved", filename: "p.xlsx" });
    expect(await saveFile(opts)).toEqual({ kind: "saved", filename: "p.xlsx" });
    const [command, body] = core.invoke.mock.calls[0] as [string, Uint8Array];
    expect(command).toBe("save_file");
    expect(body).toBe(bytes);
    expect(sentOptions()).toEqual({
      filename: "x.xlsx",
      filterName: "Excel workbook",
      extensions: ["xlsx"],
    });
  });

  it("text is sent as UTF-8 bytes; a non-ASCII name survives the header", async () => {
    core.invoke.mockResolvedValue({ kind: "saved", filename: "Přehled.csv" });
    await saveFile({ ...opts, filename: "Přehled.csv", data: "a,Kč" });
    const [, body] = core.invoke.mock.calls[0] as [string, Uint8Array];
    expect(new TextDecoder().decode(body)).toBe("a,Kč");
    expect(sentOptions()).toMatchObject({ filename: "Přehled.csv" });
  });

  it("a file that reads back different is a failure", async () => {
    core.invoke.mockRejectedValue("the saved file does not match");
    const e = await saveFile(opts).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(SaveFileError);
    expect((e as SaveFileError).detail).toMatch(/does not match/);
  });

  it("a write error is a failure with its reason", async () => {
    core.invoke.mockRejectedValue("permission denied");
    const e = await saveFile({ ...opts, data: "a,b" }).catch(
      (err: unknown) => err,
    );
    expect(e).toBeInstanceOf(SaveFileError);
    expect((e as SaveFileError).detail).toBe("permission denied");
  });
});
