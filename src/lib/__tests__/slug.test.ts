// ADR 0159 (#123): export file names keep any script, so a Russian or Cyrillic name never
// leaves a bare "-projection.xlsx", and Projections and Property detail name one
// property's file the same way.
import { describe, it, expect } from "vitest";
import { exportFilename } from "../slug";

describe("exportFilename", () => {
  it("folds Czech diacritics and joins words with dashes", () => {
    expect(
      exportFilename("Byt Javorová 12", "p1", "projection", "nominal"),
    ).toBe("byt-javorova-12-projection-nominal.xlsx");
  });

  it("keeps Cyrillic letters (й stays й)", () => {
    expect(exportFilename("Портфель", "portfolio", "projection", "real")).toBe(
      "портфель-projection-real.xlsx",
    );
    expect(exportFilename("Квартира Майская", "p2", "amortization")).toBe(
      "квартира-майская-amortization.xlsx",
    );
  });

  it("falls back when the name has no letter or digit", () => {
    expect(exportFilename("  —/  ", "prop-7", "amortization")).toBe(
      "prop-7-amortization.xlsx",
    );
  });

  it("drops an emoji with its variation selector", () => {
    expect(exportFilename("🏘️ Byt Praha", "p1", "amortization")).toBe(
      "byt-praha-amortization.xlsx",
    );
    expect(exportFilename("Byt ❤️ Brno", "p1", "amortization")).toBe(
      "byt-brno-amortization.xlsx",
    );
    expect(exportFilename("☀️", "p-3", "amortization")).toBe(
      "p-3-amortization.xlsx",
    );
  });

  it("caps the name at 100 characters", () => {
    expect(exportFilename("ж".repeat(300), "p1", "amortization")).toBe(
      `${"ж".repeat(100)}-amortization.xlsx`,
    );
  });

  it("drops characters a file name cannot hold", () => {
    expect(exportFilename('a/b:c*?"<>|', "x", "projection", "nominal")).toBe(
      "a-b-c-projection-nominal.xlsx",
    );
  });
});
