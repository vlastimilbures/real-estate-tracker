// The native menu's labels go to the `set_menu_labels` command (src-tauri/src/menu.rs);
// a refused call is swallowed, so the menu keeps its previous text.
import { describe, it, expect, vi, afterEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { setMenuLabels } = await import("../menuLabels");

const labels = {
  about: "About",
  settings: "Settings",
  newProperty: "New property",
  pages: { dashboard: "Dashboard" },
};

afterEach(() => {
  invoke.mockReset();
});

describe("setMenuLabels", () => {
  it("sends the labels to set_menu_labels", () => {
    invoke.mockResolvedValueOnce(undefined);
    setMenuLabels(labels);
    expect(invoke.mock.calls).toEqual([["set_menu_labels", { labels }]]);
  });

  it("swallows a refused call, so a label failure is never an app error", async () => {
    const rejected = Promise.reject(new Error("no menu"));
    // The rejection must get a handler; an unhandled one would surface as a new error.
    const handled = vi.spyOn(rejected, "catch");
    invoke.mockReturnValueOnce(rejected);
    expect(() => setMenuLabels(labels)).not.toThrow();
    expect(handled).toHaveBeenCalledOnce();
    await expect(handled.mock.results[0]?.value).resolves.toBeUndefined();
  });
});
