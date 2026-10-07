// #115 (ADR 0153): the wrapper behind "Show data folder".
import { describe, it, expect, vi, afterEach } from "vitest";

const invoke = vi.fn();
const isTauri = vi.fn(() => true);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../../lib/tauri", () => ({ isTauri }));

const { revealDataDir } = await import("../revealDataDir");

afterEach(() => {
  invoke.mockReset();
  isTauri.mockReturnValue(true);
});

describe("revealDataDir", () => {
  it("calls reveal_data_dir with no arguments", async () => {
    invoke.mockResolvedValueOnce(undefined);
    await revealDataDir();
    expect(invoke.mock.calls).toEqual([["reveal_data_dir"]]);
  });

  it("passes a failure on, for the screen to show the path instead", async () => {
    invoke.mockRejectedValueOnce("no folder for /x");
    await expect(revealDataDir()).rejects.toBe("no folder for /x");
  });

  it("does nothing outside the desktop app", async () => {
    isTauri.mockReturnValue(false);
    await revealDataDir();
    expect(invoke).not.toHaveBeenCalled();
  });
});
