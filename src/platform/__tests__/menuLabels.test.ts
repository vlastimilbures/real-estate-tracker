// The native menu's labels go to the `set_menu_labels` command (src-tauri/src/menu.rs);
// a refused call is swallowed, so the menu keeps its previous text.
import { describe, it, expect, vi, afterEach } from "vitest";
import { unhandledRejections } from "../../__tests__/support/unhandled";

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
    invoke.mockRejectedValueOnce({ code: "INVALID_MENU_LABEL", detail: "x" });
    // The rejection must get a handler; an unhandled one would surface as a new error.
    const unhandled = await unhandledRejections(() => {
      expect(() => setMenuLabels(labels)).not.toThrow();
    });
    expect(invoke).toHaveBeenCalledOnce();
    expect(unhandled).toEqual([]);
  });
});
