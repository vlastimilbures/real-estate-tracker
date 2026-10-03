// ADR 0111 (#21): Properties and Projections name the currency, period and date of their
// tables in one context line (the page subtitle); column headers stay unit-free.
import { describe, it, expect } from "vitest";
import { projectionsSubtitle, propertiesSubtitle } from "../tableContext";
import { isoDate } from "../../../engine";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";

describe("propertiesSubtitle", () => {
  it("names the count, the as-of date, the currency and the flow period", () => {
    expect(propertiesSubtitle(en, 3, isoDate("2026-10-03"))).toBe(
      "3 apartments · as of 03.10.2026 · amounts in Kč, flows per year",
    );
  });

  it("is translated", () => {
    expect(propertiesSubtitle(cs, 1, isoDate("2026-10-03"))).toBe(
      "1 byt · k 03.10.2026 · částky v Kč, toky za rok",
    );
  });
});

describe("projectionsSubtitle", () => {
  const baseDate = isoDate("2026-06-07");

  it("says nominal Kč and the period in Nominal mode", () => {
    expect(projectionsSubtitle(en, "nominal", baseDate)).toBe(
      "Year-by-year · nominal Kč · flows per year, balances at year end",
    );
  });

  it("names the base date in Real mode", () => {
    expect(projectionsSubtitle(en, "real", baseDate)).toBe(
      "Year-by-year · real terms (Kč at projection start 07.06.2026) · flows per year, balances at year end",
    );
  });

  it("is translated", () => {
    expect(projectionsSubtitle(cs, "real", baseDate)).toBe(
      "Rok po roce · reálné hodnoty (Kč k začátku projekce 07.06.2026) · toky za rok, zůstatky ke konci roku",
    );
  });
});
