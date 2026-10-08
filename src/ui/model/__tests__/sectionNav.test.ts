// ADR 0107 (#23): Property detail's section nav lists the sections on the page, in page
// order, and marks the one in view. ADR 0118 adds the Data check after the Overview;
// ADR 0119 §9 the Acquisition section after Financing. ADR 0155 drops the Data check for
// a deactivated property.
import { describe, it, expect } from "vitest";
import { pickCurrent, propertySections, sectionId } from "../sectionNav";

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
      "dataCheck",
      "records",
      "financing",
      "acquisition",
      "holding",
      "projection",
      "amortization",
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
      "dataCheck",
      "records",
      "financing",
      "acquisition",
      "holding",
      "projection",
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
