// ADR 0211 (#386): the projection years' span is stated once above the grid, not in a
// Period column; the export keeps its own context line.
import { describe, it, expect } from "vitest";
import { isoDate } from "../../../engine";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import {
  projectionExportNotes,
  projectionPanelHint,
  projectionsPageSubtitle,
  projectionsSubtitle,
  yearSpanNote,
} from "../tableContext";
import { yearCellPeriod } from "../projection";

const base = isoDate("2026-06-07");
const calendar = isoDate("2025-12-15");

describe("yearSpanNote (ADR 0211 §2)", () => {
  it("names the months a projection year runs from and to", () => {
    expect(yearSpanNote(en, base)).toBe("years run Jul – Jun");
    expect(yearSpanNote(en, isoDate("2026-01-15"))).toBe("years run Feb – Jan");
  });

  it("is translated", () => {
    expect(yearSpanNote(cs, base)).toBe(
      `projekční roky ${cs.monthsShort[6]} – ${cs.monthsShort[5]}`,
    );
    expect(yearSpanNote(ru, base)).toBe(
      `годы прогноза ${ru.monthsShort[6]} – ${ru.monthsShort[5]}`,
    );
  });

  it("is absent when projection years are calendar years", () => {
    expect(yearSpanNote(en, calendar)).toBeNull();
  });
});

describe("projectionsPageSubtitle and projectionPanelHint (ADR 0211 §2)", () => {
  it("end with the span note", () => {
    expect(projectionsPageSubtitle(en, "nominal", base)).toBe(
      "Year-by-year · nominal Kč · flows per year, balances at year end · years run Jul – Jun",
    );
    expect(projectionPanelHint(en, "nominal Kč", base)).toBe(
      "nominal Kč · years run Jul – Jun",
    );
  });

  it("are the plain context line with calendar years", () => {
    expect(projectionsPageSubtitle(en, "real", calendar)).toBe(
      projectionsSubtitle(en, "real", calendar),
    );
    expect(projectionPanelHint(en, "nominal Kč", calendar)).toBe("nominal Kč");
  });

  it("leave the export's note lines as they were (ADR 0211 §5)", () => {
    expect(projectionExportNotes(en, "Portfolio", "nominal", base)).toEqual([
      "Portfolio",
      "Year-by-year · nominal Kč · flows per year, balances at year end",
    ]);
  });
});

describe("yearCellPeriod (ADR 0211 §1)", () => {
  it("is a year's span, or the opening label", () => {
    expect(yearCellPeriod(en, base, 1)).toBe("Jul 2026 – Jun 2027");
    expect(yearCellPeriod(en, base, 0)).toBe(en.projGrid.opening);
  });

  it("is absent with calendar years", () => {
    expect(yearCellPeriod(en, calendar, 1)).toBeNull();
  });
});
