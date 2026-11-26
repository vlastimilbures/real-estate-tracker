// The leave guard holds back a navigation only when it moves: it compares the fields the
// navigation sets with the current ones, and nothing else (UX-030, ADR 0142). Staying
// where you are never asks. Characterisation for #468, which splits this store.
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "../uiStore";

const ui = () => useUiStore.getState();
const asks = () => ui().pendingLeave !== null;

beforeEach(() => {
  useUiStore.setState({
    route: "dashboard",
    selectedPropertyId: null,
    settingsTab: "assumptions",
    request: null,
    notice: null,
    unsavedSources: [],
    pendingLeave: null,
    pendingSource: null,
  });
  ui().setUnsavedChanges("form", true);
});

describe("what counts as leaving (guarded)", () => {
  it("navigating to the current route does not ask", () => {
    ui().navigate("dashboard");
    expect(asks()).toBe(false);
  });

  it("another route asks, and Discard applies it", () => {
    ui().navigate("projections");
    expect(asks()).toBe(true);
    expect(ui().route).toBe("dashboard");
    ui().confirmLeave();
    expect(ui().route).toBe("projections");
  });

  it("Settings without a tab compares only the route: on the Backup tab it stays put", () => {
    useUiStore.setState({ route: "settings", settingsTab: "backup" });
    ui().openSettings();
    expect(asks()).toBe(false);
    expect(ui().settingsTab).toBe("backup");
  });

  it("Settings on another tab asks; the current tab does not", () => {
    useUiStore.setState({ route: "settings" });
    ui().openSettings("assumptions");
    expect(asks()).toBe(false);
    ui().setSettingsTab("assumptions");
    expect(asks()).toBe(false);
    ui().openSettings("backup");
    expect(asks()).toBe(true);
  });

  it("the open property without a target does not ask; with a target it asks", () => {
    useUiStore.setState({ route: "property", selectedPropertyId: "p1" });
    ui().openProperty("p1");
    expect(asks()).toBe(false);
    ui().openProperty("p1", "financing");
    expect(asks()).toBe(true);
    ui().confirmLeave();
    expect(ui().request).toMatchObject({ target: "financing" });
  });

  it("another property asks, and Discard applies the id and the target together", () => {
    useUiStore.setState({ route: "property", selectedPropertyId: "p1" });
    ui().openProperty("p2", "holding");
    expect(ui().selectedPropertyId).toBe("p1");
    ui().confirmLeave();
    expect(ui().selectedPropertyId).toBe("p2");
    expect(ui().request).toMatchObject({ target: "holding" });
  });

  it("⌘N on Properties asks, also while an earlier one is unhandled (ADR 0269)", () => {
    // The first request lands (the form was clean), and nothing handles it.
    ui().setUnsavedChanges("form", false);
    ui().requestNewProperty();
    ui().setUnsavedChanges("form", true);
    ui().requestNewProperty();
    expect(asks()).toBe(true);
  });

  it("a Guide term asks on the Guide, also the same term again (ADR 0269)", () => {
    ui().setUnsavedChanges("form", false);
    ui().openGuide("noi");
    ui().setUnsavedChanges("form", true);
    ui().openGuide("noi");
    expect(asks()).toBe(true);
  });

  it("Clear sample sets its notice at once; only the move to the Dashboard waits", () => {
    useUiStore.setState({ route: "properties" });
    ui().showSampleCleared("before-clear.json");
    expect(ui().notice).toEqual({
      kind: "sampleCleared",
      file: "before-clear.json",
    });
    expect(asks()).toBe(true);
    expect(ui().route).toBe("properties");
  });

  it("on the Dashboard, Clear sample does not ask", () => {
    ui().showSampleCleared("before-clear.json");
    expect(asks()).toBe(false);
  });
});
