import { describe, it, expect } from "vitest";
import {
  bandPill,
  dscrBadge,
  dscrBand,
  dscrBandWord,
  ltvBand,
  ltvBandWord,
} from "../health";
import { en } from "../../../i18n/en";
import { D } from "../../../lib/money";

describe("health bands", () => {
  it("ltvBand", () => {
    expect(ltvBand(D(0.33))).toBe("good");
    expect(ltvBand(D(0.5))).toBe("good");
    expect(ltvBand(D(0.6))).toBe("warn");
    expect(ltvBand(D(0.75))).toBe("warn");
    expect(ltvBand(D(0.9))).toBe("bad");
  });
  it("dscrBand", () => {
    expect(dscrBand(null)).toBe("neutral");
    expect(dscrBand(D(2.85))).toBe("good");
    expect(dscrBand(D(1.2))).toBe("good");
    expect(dscrBand(D(1.1))).toBe("warn");
    expect(dscrBand(D(1))).toBe("warn");
    expect(dscrBand(D(0.91))).toBe("bad");
  });
});

// DR-079: thresholds compare as Decimals: a value just past one is not rounded back
// into the safer band by a float conversion.
describe("band thresholds are exact", () => {
  it("LTV just above 50 % is a warning", () => {
    expect(ltvBand(D("0.50000000000000000001"))).toBe("warn");
  });
  it("DSCR just below 1.2 is a warning", () => {
    expect(dscrBand(D("1.19999999999999999999"))).toBe("warn");
  });
});

// UX-027: the band is also said in words, so it does not rely on colour alone.
describe("band words", () => {
  it("ltvBandWord names the LTV band", () => {
    expect(ltvBandWord(en, D(0.33))).toBe("Conservative");
    expect(ltvBandWord(en, D(0.6))).toBe("Moderate");
    expect(ltvBandWord(en, D(0.9))).toBe("High");
  });
  it("dscrBandWord names the DSCR band; no debt has no word", () => {
    expect(dscrBandWord(en, D(1.3))).toBe("Covers debt");
    expect(dscrBandWord(en, D(1.05))).toBe("Covers debt");
    expect(dscrBandWord(en, D(0.9))).toBe("Shortfall");
    expect(dscrBandWord(en, null)).toBeNull();
  });
  it("the pill text joins the number and the word", () => {
    expect(bandPill("62,0 %", "Moderate")).toBe("62,0 % · Moderate");
    expect(bandPill("—", null)).toBe("—");
  });
});

describe("DSCR badge (ADR 0126)", () => {
  it("no debt (null DSCR) has no badge", () => {
    expect(dscrBadge(en, null)).toBeUndefined();
  });
  it("a DSCR has its band and word", () => {
    expect(dscrBadge(en, D(1.5))).toEqual({
      band: "good",
      text: en.dashboard.badgeCoversDebt,
    });
    expect(dscrBadge(en, D(0.8))).toEqual({
      band: "bad",
      text: en.dashboard.badgeShortfall,
    });
  });
});
