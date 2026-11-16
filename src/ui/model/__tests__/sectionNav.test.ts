// ADR 0107 (#23): Property detail's section nav lists the sections on the page, in page
// order, and marks the one in view. ADR 0118 adds the Data check, last since ADR 0223;
// ADR 0119 §9 the Acquisition section after Financing. ADR 0155 drops the Data check for
// a deactivated property.
import { describe, it, expect } from "vitest";
import {
  pickCurrent,
  propertySections,
  sectionId,
  moreSides,
  scrollToShow,
} from "../sectionNav";

describe("propertySections", () => {
  it("lists every section in page order when the engine has output", () => {
    expect(
      propertySections({
        overview: true,
        dataCheck: true,
        projection: true,
        amortization: true,
      }),
    ).toEqual([
      "overview",
      "records",
      "financing",
      "acquisition",
      "holding",
      "projection",
      "amortization",
      "dataCheck",
    ]);
  });

  it("drops the sections the page does not render", () => {
    expect(
      propertySections({
        overview: false,
        dataCheck: false,
        projection: false,
        amortization: false,
      }),
    ).toEqual(["records", "financing", "holding"]);
    expect(
      propertySections({
        overview: true,
        dataCheck: true,
        projection: true,
        amortization: false,
      }),
    ).toEqual([
      "overview",
      "records",
      "financing",
      "acquisition",
      "holding",
      "projection",
      "dataCheck",
    ]);
  });

  it("drops the Data check for a deactivated property (ADR 0155)", () => {
    expect(
      propertySections({
        overview: true,
        dataCheck: false,
        projection: true,
        amortization: false,
      }),
    ).toEqual([
      "overview",
      "records",
      "financing",
      "acquisition",
      "holding",
      "projection",
    ]);
  });

  it("gives each section a stable element id", () => {
    expect(sectionId("financing")).toBe("pd-financing");
  });
});

describe("pickCurrent", () => {
  const order = ["a", "b", "c"] as const;

  it("is the first section in the band, by page order", () => {
    expect(pickCurrent(order, new Set(["c", "b"]), "a", false)).toBe("b");
  });

  it("keeps the previous section while none is in the band", () => {
    expect(pickCurrent(order, new Set(), "b", false)).toBe("b");
  });

  it("falls back to the first section with no previous one", () => {
    expect(pickCurrent(order, new Set(), null, false)).toBe("a");
  });

  it("is the last section at the bottom of the page", () => {
    expect(pickCurrent(order, new Set(["b"]), "b", true)).toBe("c");
  });

  it("ignores ids that are not sections and handles an empty page", () => {
    expect(pickCurrent(order, new Set(["x"]), null, false)).toBe("a");
    expect(pickCurrent([], new Set(), null, true)).toBeNull();
  });
});

// ADR 0225 §2: the Guide's links in one sideways-scrolling row in a narrow window.
describe("scrollToShow", () => {
  const view = { scroll: 100, width: 300 };
  it("leaves a link already in view", () => {
    expect(scrollToShow({ start: 150, width: 80 }, view, 24)).toBeNull();
  });
  it("scrolls back to a link off the start, with a margin", () => {
    expect(scrollToShow({ start: 60, width: 80 }, view, 24)).toBe(36);
  });
  it("scrolls on to a link off the end, with a margin", () => {
    expect(scrollToShow({ start: 380, width: 80 }, view, 24)).toBe(184);
  });
  it("never below zero", () => {
    expect(scrollToShow({ start: 10, width: 80 }, view, 24)).toBe(0);
  });
});

describe("moreSides", () => {
  it("marks the side with more links", () => {
    expect(moreSides(0, 300, 900)).toEqual({ start: false, end: true });
    expect(moreSides(200, 300, 900)).toEqual({ start: true, end: true });
    expect(moreSides(600, 300, 900)).toEqual({ start: true, end: false });
  });
  it("a row that fits has none (sub-pixel slack ignored)", () => {
    expect(moreSides(0, 300, 300.5)).toEqual({ start: false, end: false });
  });
});
