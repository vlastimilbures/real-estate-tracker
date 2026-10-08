// ADR 0111 (#21): Properties and Projections name the currency, period and date of their
// tables in one context line (the page subtitle); column headers stay unit-free.
import { describe, it, expect } from "vitest";
import {
  lensLabel,
  projectionExportNotes,
  projectionsSubtitle,
  propertiesSubtitle,
} from "../tableContext";
import { isoDate } from "../../../engine";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";

describe("propertiesSubtitle", () => {
  const base = isoDate("2026-06-07");
  const today = { kind: "today" } as const;

  it("names the count, the as-of date, the currency and the flow period", () => {
    expect(propertiesSubtitle(en, 3, isoDate("2026-10-03"), today, base)).toBe(
      "3 apartments · as of 03.10.2026 · amounts in Kč, flows per year",
    );
  });

  it("is translated", () => {
    expect(propertiesSubtitle(cs, 1, isoDate("2026-10-03"), today, base)).toBe(
      "1 byt · k 03.10.2026 · částky v Kč, toky za rok",
    );
  });

  it("names the projection year Today shows (ADR 0150)", () => {
    const y1 = { kind: "projection", year: 1, calendarYear: 2027 } as const;
    expect(propertiesSubtitle(en, 3, isoDate("2027-01-15"), y1, base)).toBe(
      "3 apartments · as of 15.01.2027 (projection year Y1 · 2027, Jul 2026 – Jun 2027) · amounts in Kč, flows per year",
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

// ADR 0159 (#123): one lens label for every page and export.
describe("lensLabel", () => {
  const baseDate = isoDate("2026-06-07");

  it("names the lens, and the base date in Real mode when given", () => {
    expect(lensLabel(en, "nominal")).toBe("nominal Kč");
    expect(lensLabel(en, "real")).toBe("real terms");
    expect(lensLabel(en, "nominal", baseDate)).toBe("nominal Kč");
    expect(lensLabel(en, "real", baseDate)).toBe(
      "real terms (Kč at projection start 07.06.2026)",
    );
  });
});

// ADR 0159 (#123): a projection export carries what the screen shows above the table.
describe("projectionExportNotes", () => {
  it("names the entity, then the page's context line", () => {
    const baseDate = isoDate("2026-06-07");
    expect(projectionExportNotes(en, "Portfolio", "real", baseDate)).toEqual([
      "Portfolio",
      projectionsSubtitle(en, "real", baseDate),
    ]);
  });
});
