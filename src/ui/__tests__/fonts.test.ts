// Start-up loads the bundled fonts before the first render (ADR 0192).
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadAppFonts } from "../fonts";

function fontSet(load: (font: string, text?: string) => Promise<FontFace[]>) {
  return { load: vi.fn(load) } as unknown as FontFaceSet & {
    load: ReturnType<typeof vi.fn>;
  };
}
const face = {} as FontFace;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("loadAppFonts", () => {
  it("loads both families for the chart text, Latin and Latin Extended", async () => {
    const error = vi.spyOn(console, "error");
    const fonts = fontSet(() => Promise.resolve([face]));
    await loadAppFonts(fonts);
    const calls = fonts.load.mock.calls as [string, string][];
    expect(calls.map(([font]) => font)).toEqual([
      '1em "Public Sans Variable"',
      '1em "Fraunces Variable"',
    ]);
    for (const [, text] of calls) expect(text).toMatch(/^[0-9 ]+Kč$/);
    expect(error).not.toHaveBeenCalled();
  });

  it("resolves and logs when a font fails to load or is not registered", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fonts = fontSet((font) =>
      font.includes("Fraunces")
        ? Promise.reject(new Error("missing"))
        : Promise.resolve([]),
    );
    await expect(loadAppFonts(fonts)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second when a load never settles", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const done = loadAppFonts(fontSet(() => new Promise<FontFace[]>(() => {})));
    await vi.advanceTimersByTimeAsync(1000);
    await expect(done).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("Fonts not loaded after 1000 ms");
  });
});
