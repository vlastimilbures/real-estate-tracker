import { describe, it, expect } from "vitest";
import { utc } from "../../engine";
import {
  fmtCzk,
  fmtCzkM,
  fmtPct,
  fmtPp,
  fmtMultiple,
  fmtDscr,
  fmtDate,
  signTone,
  pickCzkAxisUnit,
  fmtCzkAxisValue,
  fmtCzkAxisTick,
} from "../format";

describe("fmtCzk", () => {
  it("groups thousands with spaces and appends Kč", () => {
    expect(fmtCzk(28_730_000)).toBe("28 730 000 Kč");
    expect(fmtCzk(0)).toBe("0 Kč");
    expect(fmtCzk(846_600)).toBe("846 600 Kč");
  });
  it("rounds to whole CZK (half-up)", () => {
    expect(fmtCzk(1_642_907.31)).toBe("1 642 907 Kč");
    expect(fmtCzk(0.5)).toBe("1 Kč");
  });
  it("negatives: leading minus by default, parentheses on request", () => {
    expect(fmtCzk(-57_334)).toBe("−57 334 Kč");
    expect(fmtCzk(-57_334, { parens: true })).toBe("(57 334 Kč)");
  });
  it("can drop the suffix", () => {
    expect(fmtCzk(1_000, { suffix: false })).toBe("1 000");
  });
});

describe("fmtCzkM", () => {
  it("formats millions with one decimal + unit", () => {
    expect(fmtCzkM(93_182_810.46)).toBe("93,2 M Kč");
    expect(fmtCzkM(28_730_000)).toBe("28,7 M Kč");
  });
  it("negative millions use a minus", () => {
    expect(fmtCzkM(-127_030.8)).toBe("−0,1 M Kč");
  });
});

describe("fmtPp", () => {
  it("formats a ratio as bare percentage points (unit added by the caller)", () => {
    expect(fmtPp(0.02)).toBe("2,0");
    expect(fmtPp(0.0125, 2)).toBe("1,25");
    expect(fmtPp(-0.03)).toBe("−3,0");
  });
});

describe("fmtPct", () => {
  it("renders a ratio as a Czech percentage", () => {
    expect(fmtPct(0.3312)).toBe("33,1 %");
    expect(fmtPct(0.035226, 2)).toBe("3,52 %");
    expect(fmtPct(0.0205, 2)).toBe("2,05 %");
  });
});

describe("fmtMultiple", () => {
  it("renders 0.00x", () => {
    expect(fmtMultiple(4.8496)).toBe("4,85x");
    expect(fmtMultiple(0.9113)).toBe("0,91x");
  });
});

describe("fmtDate", () => {
  it("renders dd.mm.yyyy from a UTC date", () => {
    expect(fmtDate(utc(2026, 6, 7))).toBe("07.06.2026");
    expect(fmtDate(utc(2031, 1, 17))).toBe("17.01.2031");
  });
});

describe("tones & bands", () => {
  it("signTone", () => {
    expect(signTone(-1)).toBe("negative");
    expect(signTone(1)).toBe("positive");
    expect(signTone(0)).toBe("neutral");
  });
});

describe("pickCzkAxisUnit", () => {
  it("uses millions with no decimals when max ≥ 10M", () => {
    expect(pickCzkAxisUnit([28_730_000, 11_000_000])).toEqual({
      divisor: 1_000_000,
      dp: 0,
      label: "M Kč",
      shortLabel: "M",
    });
  });

  it("uses millions with one decimal when max is between 1M and 10M", () => {
    expect(pickCzkAxisUnit([3_200_000, 1_500_000])).toEqual({
      divisor: 1_000_000,
      dp: 1,
      label: "M Kč",
      shortLabel: "M",
    });
  });

  it("uses thousands with no decimals when max ≥ 10k", () => {
    expect(pickCzkAxisUnit([850_000, 200_000])).toEqual({
      divisor: 1_000,
      dp: 0,
      label: "tis. Kč",
      shortLabel: "tis.",
    });
  });

  it("uses thousands with one decimal when max is between 1k and 10k", () => {
    expect(pickCzkAxisUnit([3_500, -2_100])).toEqual({
      divisor: 1_000,
      dp: 1,
      label: "tis. Kč",
      shortLabel: "tis.",
    });
  });

  it("falls back to plain Kč when max < 1k", () => {
    expect(pickCzkAxisUnit([500, -100])).toEqual({
      divisor: 1,
      dp: 0,
      label: "Kč",
      shortLabel: "",
    });
  });

  it("falls back to millions when input is empty or all-zero (historical default)", () => {
    expect(pickCzkAxisUnit([])).toEqual({
      divisor: 1_000_000,
      dp: 0,
      label: "M Kč",
      shortLabel: "M",
    });
    expect(pickCzkAxisUnit([0, 0, 0])).toEqual({
      divisor: 1_000_000,
      dp: 0,
      label: "M Kč",
      shortLabel: "M",
    });
  });

  it("respects absolute value (negative cash flow picks units off |max|)", () => {
    expect(pickCzkAxisUnit([-57_334, 200_000]).label).toBe("tis. Kč");
  });
});

describe("fmtCzkAxisValue", () => {
  it("formats with the picked unit's divisor + dp, Czech grouping", () => {
    const unit = pickCzkAxisUnit([850_000, 200_000]);
    expect(fmtCzkAxisValue(800_000, unit)).toBe("800");
    expect(fmtCzkAxisValue(1_000_000, unit)).toBe("1 000");
  });

  it("renders negatives with the real minus sign", () => {
    const unit = pickCzkAxisUnit([-57_334, 200_000]);
    expect(fmtCzkAxisValue(-57_334, unit)).toBe("−57");
  });
});

describe("fmtCzkAxisTick", () => {
  it("appends compact unit suffix for millions", () => {
    const unit = pickCzkAxisUnit([28_730_000]);
    expect(fmtCzkAxisTick(120_000_000, unit)).toBe("120 M");
  });

  it("appends compact unit suffix for thousands", () => {
    const unit = pickCzkAxisUnit([850_000]);
    expect(fmtCzkAxisTick(800_000, unit)).toBe("800 tis.");
  });

  it("no suffix for plain Kč", () => {
    const unit = pickCzkAxisUnit([500]);
    expect(fmtCzkAxisTick(500, unit)).toBe("500");
  });

  it("handles negative values", () => {
    const unit = pickCzkAxisUnit([28_730_000]);
    expect(fmtCzkAxisTick(-50_000_000, unit)).toBe("−50 M");
  });
});

describe("thousands axis unit per language (UX-034)", () => {
  it("uses the caller's thousands word for the tick suffix and label", () => {
    const unit = pickCzkAxisUnit([850_000], "тыс.");
    expect(unit.shortLabel).toBe("тыс.");
    expect(unit.label).toBe("тыс. Kč");
    expect(fmtCzkAxisTick(800_000, unit)).toBe("800 тыс.");
  });

  it("leaves millions alone", () => {
    expect(pickCzkAxisUnit([28_730_000], "k").shortLabel).toBe("M");
  });
});

describe("currency (always CZK, UX-017)", () => {
  it("uses Kč symbol and unit labels", () => {
    expect(fmtCzk(846_600)).toContain("Kč");
    expect(fmtCzkM(28_730_000)).toContain("M Kč");
    expect(pickCzkAxisUnit([850_000]).label).toBe("tis. Kč");
  });
});

// P3 characterisation: rounding boundaries and sign handling, asserted as today's output.
describe("rounding boundaries (half-up, away from zero)", () => {
  it("fmtCzk rounds x.5 up in magnitude and drops the sign of a value that rounds to 0", () => {
    expect(fmtCzk("0.5")).toBe("1 Kč");
    expect(fmtCzk("2.5")).toBe("3 Kč");
    expect(fmtCzk("0.49999")).toBe("0 Kč");
    expect(fmtCzk("-0.5")).toBe("−1 Kč");
    expect(fmtCzk("-1.5")).toBe("−2 Kč");
    expect(fmtCzk("-0.4")).toBe("0 Kč");
    expect(fmtCzk("-0.4", { parens: true })).toBe("0 Kč");
    expect(fmtCzk("1234567.5")).toBe("1 234 568 Kč");
  });

  it("negatives: minus by default; accounting parentheses only on request", () => {
    expect(fmtCzk("-57334")).toBe("−57 334 Kč");
    expect(fmtCzk("-57334", { parens: true })).toBe("(57 334 Kč)");
  });

  it("M Kč: one decimal, half-up at 1,05 M", () => {
    expect(fmtCzkM("1049999")).toBe("1,0 M Kč");
    expect(fmtCzkM("1050000")).toBe("1,1 M Kč");
    expect(fmtCzkM("-1050000")).toBe("−1,1 M Kč");
    expect(fmtCzkM("999999999")).toBe("1 000,0 M Kč");
  });

  it("percent: one decimal, half-up at 0,05 %", () => {
    expect(fmtPct("0.00049")).toBe("0,0 %");
    expect(fmtPct("0.0005")).toBe("0,1 %");
    expect(fmtPct("-0.0005")).toBe("−0,1 %");
  });

  it("multiple: two decimals, half-up", () => {
    expect(fmtMultiple("0.004999")).toBe("0,00x");
    expect(fmtMultiple("0.005")).toBe("0,01x");
    expect(fmtMultiple("2.84522")).toBe("2,85x");
    expect(fmtMultiple("-0.5")).toBe("−0,50x");
  });

  // UX-060 (DR-110): the sign follows the rounded value, like fmtCzk.
  it("a small negative that rounds to zero shows no minus", () => {
    expect(fmtCzkM("-49999")).toBe("0,0 M Kč");
    expect(fmtPct("-0.00049")).toBe("0,0 %");
    expect(fmtMultiple("-0.004")).toBe("0,00x");
    expect(fmtCzkM("-50000")).toBe("−0,1 M Kč");
    expect(fmtPct("-0.0005")).toBe("−0,1 %");
  });

  // UX-061 (D-35, DR-108): DSCR above 99 displays as ">99,00x"; plain multiples are
  // not capped.
  it("caps the DSCR display at 99×", () => {
    expect(fmtDscr("99")).toBe("99,00x");
    expect(fmtDscr("99.995")).toBe(">99,00x");
    expect(fmtDscr("150")).toBe(">99,00x");
    expect(fmtDscr("0.9113")).toBe("0,91x");
    expect(fmtMultiple("150")).toBe("150,00x");
  });

  it("fmtDate pads day and month and handles a leap day", () => {
    expect(fmtDate(utc(2026, 1, 5))).toBe("05.01.2026");
    expect(fmtDate(utc(2024, 2, 29))).toBe("29.02.2024");
    expect(fmtDate(utc(2026, 12, 31))).toBe("31.12.2026");
  });
});
