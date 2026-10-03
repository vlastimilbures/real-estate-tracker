// Navigation/presentation store: pure synchronous state, no DB. Driven directly via
// getState() (zustand works outside React), so no DOM is needed.
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_COMPARE, useUiStore } from "../uiStore";

beforeEach(() => {
  // Reset the singleton to its initial state before each test.
  useUiStore.setState({
    route: "dashboard",
    selectedPropertyId: null,
    mode: "nominal",
  });
});

describe("uiStore", () => {
  it("starts on the dashboard, nominal lens, no property selected", () => {
    const s = useUiStore.getState();
    expect(s.route).toBe("dashboard");
    expect(s.mode).toBe("nominal");
    expect(s.selectedPropertyId).toBeNull();
  });

  it("navigate() switches the route without touching the selected property", () => {
    useUiStore.getState().navigate("projections");
    expect(useUiStore.getState().route).toBe("projections");
    expect(useUiStore.getState().selectedPropertyId).toBeNull();
  });

  it("openProperty() drills into the property route and records the id", () => {
    useUiStore.getState().openProperty("prop-42");
    const s = useUiStore.getState();
    expect(s.route).toBe("property");
    expect(s.selectedPropertyId).toBe("prop-42");
  });

  it("setMode() toggles the Nominal/Real lens", () => {
    useUiStore.getState().setMode("real");
    expect(useUiStore.getState().mode).toBe("real");
    useUiStore.getState().setMode("nominal");
    expect(useUiStore.getState().mode).toBe("nominal");
  });
});

// UX-066 (DR-143): File ▸ New Property… (⌘N) opens the Add form on Properties.
describe("requestNewProperty", () => {
  beforeEach(() => {
    useUiStore.setState({
      newPropertyRequested: false,
      unsavedChanges: false,
      pendingLeave: null,
    });
  });

  it("goes to Properties and asks it to open the Add form", () => {
    useUiStore.getState().requestNewProperty();
    const s = useUiStore.getState();
    expect(s.route).toBe("properties");
    expect(s.newPropertyRequested).toBe(true);
    s.clearNewPropertyRequest();
    expect(useUiStore.getState().newPropertyRequested).toBe(false);
  });

  it("is held back by unsaved edits like any navigation (UX-030)", () => {
    useUiStore.setState({ unsavedChanges: true });
    useUiStore.getState().requestNewProperty();
    let s = useUiStore.getState();
    expect(s.route).toBe("dashboard");
    expect(s.newPropertyRequested).toBe(false);
    expect(s.pendingLeave).not.toBeNull();
    s.confirmLeave();
    s = useUiStore.getState();
    expect(s.route).toBe("properties");
    expect(s.newPropertyRequested).toBe(true);
  });
});

// Several forms can hold unsaved edits at once; each registers under its own key.
describe("setUnsavedChanges", () => {
  beforeEach(() => {
    useUiStore.setState({
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
    });
  });

  it("stays unsaved until every form is clean", () => {
    const s = useUiStore.getState();
    s.setUnsavedChanges("a", true);
    s.setUnsavedChanges("b", true);
    s.setUnsavedChanges("a", true);
    s.setUnsavedChanges("b", false);
    expect(useUiStore.getState().unsavedChanges).toBe(true);
    expect(useUiStore.getState().unsavedSources).toEqual(["a"]);
    s.setUnsavedChanges("a", false);
    expect(useUiStore.getState().unsavedChanges).toBe(false);
  });

  it("Discard clears every form", () => {
    const s = useUiStore.getState();
    s.setUnsavedChanges("a", true);
    s.setUnsavedChanges("b", true);
    s.navigate("projections");
    useUiStore.getState().confirmLeave();
    expect(useUiStore.getState().unsavedSources).toEqual([]);
    expect(useUiStore.getState().unsavedChanges).toBe(false);
  });
});

// ADR 0101 (#50): the Scenarios compare selection, Base toggle and crash timing last
// for the session, so a detour to another page keeps them.
describe("scenario compare state", () => {
  beforeEach(() => {
    useUiStore.setState({ compareIds: [], compareBase: true, crashAtYear: 0 });
  });

  it("starts with nothing ticked, Base on, crash at the start", () => {
    const s = useUiStore.getInitialState();
    expect(s.compareIds).toEqual([]);
    expect(s.compareBase).toBe(true);
    expect(s.crashAtYear).toBe(0);
  });

  it("toggleCompare ticks and unticks", () => {
    const s = useUiStore.getState();
    s.toggleCompare("a");
    s.toggleCompare("b");
    expect(useUiStore.getState().compareIds).toEqual(["a", "b"]);
    s.toggleCompare("a");
    expect(useUiStore.getState().compareIds).toEqual(["b"]);
  });

  it(`toggleCompare ticks at most ${MAX_COMPARE}`, () => {
    expect(MAX_COMPARE).toBe(3);
    const s = useUiStore.getState();
    for (const id of ["a", "b", "c", "d"]) s.toggleCompare(id);
    expect(useUiStore.getState().compareIds).toEqual(["a", "b", "c"]);
  });

  it("tickCompare says whether the id is ticked (ADR 0093)", () => {
    const s = useUiStore.getState();
    expect(s.tickCompare("a")).toBe(true);
    expect(s.tickCompare("a")).toBe(true);
    s.tickCompare("b");
    s.tickCompare("c");
    expect(s.tickCompare("d")).toBe(false);
    expect(useUiStore.getState().compareIds).toEqual(["a", "b", "c"]);
  });

  it("pruneCompare drops ids that no longer exist and keeps the order", () => {
    useUiStore.setState({ compareIds: ["c", "a", "b"] });
    useUiStore.getState().pruneCompare(["a", "c"]);
    expect(useUiStore.getState().compareIds).toEqual(["c", "a"]);
  });

  it("pruneCompare leaves the selection as it is when every id exists", () => {
    const ids = ["a", "b"];
    useUiStore.setState({ compareIds: ids });
    useUiStore.getState().pruneCompare(["b", "a", "z"]);
    expect(useUiStore.getState().compareIds).toBe(ids);
  });

  it("toggleCompareBase and setCrashAtYear set the other two", () => {
    const s = useUiStore.getState();
    s.toggleCompareBase();
    expect(useUiStore.getState().compareBase).toBe(false);
    s.toggleCompareBase();
    expect(useUiStore.getState().compareBase).toBe(true);
    s.setCrashAtYear(5);
    expect(useUiStore.getState().crashAtYear).toBe(5);
  });

  it("presets panel: no manual choice at first, then the one set (ADR 0106)", () => {
    expect(useUiStore.getInitialState().presetsOpen).toBeNull();
    useUiStore.getState().setPresetsOpen(false);
    expect(useUiStore.getState().presetsOpen).toBe(false);
    useUiStore.setState({ presetsOpen: null });
  });
});
