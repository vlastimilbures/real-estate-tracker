// #568 review nit: a same-date duplicate beside a leftover block flags three blocks, and
// the leftover pairs with both duplicates. The notice shows that hint once (ADR 0258).
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

describe("leftoverBlockHints with a same-date duplicate", () => {
  it("gives each hint text once", () => {
    const p: Portfolio = {
      ...portfolio,
      mortgages: [
        ...portfolio.mortgages,
        block("m-dup", "2024-03-12"),
        block("m-left", "2024-03-01"),
      ],
    };
    const texts = leftoverBlockHints(en, validatePortfolio(p), p).map(
      (h) => h.text,
    );
    expect(texts).toEqual([
      en.errorBoundary.leftoverBlock("Byt Dubova", "01.03.2024", "12.03.2024"),
    ]);
  });
});
