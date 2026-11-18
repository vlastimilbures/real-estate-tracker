// ADR 0258: a pair of stored mortgage blocks one month or less apart, which the engine
// refuses as REFINANCE_WITHIN_A_MONTH, gets a hint line naming both start dates. Usually
// one block is left over from a corrected start date (an import before ADR 0226).
import { describe, it, expect } from "vitest";
import { leftoverBlockHints } from "../invalidData";
import { getDict } from "../../../i18n";
import {
  isoDate,
  validatePortfolio,
  type MortgageBlock,
  type Portfolio,
} from "../../../engine";
import { portfolio } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const dubova = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;
const block = (id: string, start: string): MortgageBlock => ({
  ...dubova,
  id,
  startDate: isoDate(start),
});
const withBlocks = (...extra: MortgageBlock[]): Portfolio => ({
  ...portfolio,
  mortgages: [...portfolio.mortgages, ...extra],
});
const hints = (p: Portfolio, t = en) =>
  leftoverBlockHints(t, validatePortfolio(p), p);

describe("leftoverBlockHints (ADR 0258)", () => {
  it("names the property and both start dates, earlier first", () => {
    // Byt Dubova from 12.03.2024, plus a row imported from 01.03.2024.
    const p = withBlocks(block("m-left", "2024-03-01"));
    expect(hints(p)).toEqual([
      {
        text: en.errorBoundary.leftoverBlock(
          "Byt Dubova",
          "01.03.2024",
          "12.03.2024",
        ),
        propertyId: "dubova",
      },
    ]);
  });

  it("pairs only blocks within a month of each other", () => {
    const p = withBlocks(
      block("m-2031a", "2031-03-12"),
      block("m-2031b", "2031-04-12"),
      block("m-left", "2024-03-20"),
    );
    expect(hints(p).map((h) => h.text)).toEqual([
      en.errorBoundary.leftoverBlock("Byt Dubova", "12.03.2024", "20.03.2024"),
      en.errorBoundary.leftoverBlock("Byt Dubova", "12.03.2031", "12.04.2031"),
    ]);
  });

  it("speaks the user's language", () => {
    const cs = getDict("cs");
    const p = withBlocks(block("m-left", "2024-03-01"));
    expect(hints(p, cs).map((h) => h.text)).toEqual([
      cs.errorBoundary.leftoverBlock("Byt Dubova", "01.03.2024", "12.03.2024"),
    ]);
  });

  it("names the Financing section as the page does", () => {
    for (const lang of ["en", "cs", "ru"] as const) {
      const t = getDict(lang);
      expect(t.errorBoundary.leftoverBlock("A", "B", "C")).toContain(
        t.propertyDetail.sectionFinancing,
      );
    }
  });

  it("gives no hint for valid data, other rules or a missing portfolio", () => {
    // A real refinance more than a month later.
    expect(hints(withBlocks(block("m-next", "2031-03-12")))).toEqual([]);
    // Two blocks on one date are a duplicate, not a leftover pair.
    expect(hints(withBlocks(block("m-same", "2024-03-12")))).toEqual([]);
    expect(
      leftoverBlockHints(
        en,
        [
          {
            code: "INSTALMENT_BELOW_INTEREST",
            entity: "mortgage",
            id: dubova.id,
          },
        ],
        portfolio,
      ),
    ).toEqual([]);
    expect(
      leftoverBlockHints(
        en,
        [
          {
            code: "REFINANCE_WITHIN_A_MONTH",
            entity: "mortgage",
            id: dubova.id,
          },
        ],
        null,
      ),
    ).toEqual([]);
  });
});
