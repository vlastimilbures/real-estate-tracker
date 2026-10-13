// Start-up loads the bundled fonts before the first render (ADR 0192).
import { describe, it, expect, vi } from "vitest";
import { loadAppFonts } from "../fonts";

function fontSet(load: (font: string, text?: string) => Promise<FontFace[]>) {
  return { load: vi.fn(load) } as unknown as FontFaceSet & {
    load: ReturnType<typeof vi.fn>;
  };
}

describe("loadAppFonts", () => {
  it("loads both families for the chart text", async () => {
    const fonts = fontSet(() => Promise.resolve([]));
    await loadAppFonts(fonts);
    const calls = fonts.load.mock.calls as [string, string][];
    expect(calls.map(([font]) => font)).toEqual([
      '1em "Public Sans Variable"',
      '1em "Fraunces Variable"',
    ]);
    for (const [, text] of calls) expect(text).toContain("0123456789 Kč");
  });

  it("resolves when a font fails to load", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fonts = fontSet((font) =>
      font.includes("Fraunces")
        ? Promise.reject(new Error("missing"))
        : Promise.resolve([]),
    );
    await expect(loadAppFonts(fonts)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
