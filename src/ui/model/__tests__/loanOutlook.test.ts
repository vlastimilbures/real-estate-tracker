// ADR 0117 (#31b): the property page's Loan outlook lists every loan block's fixation end,
// balance at reset and status, oldest first, and the loan's remaining term.
import { describe, it, expect } from "vitest";
import { loanOutlook, remainingTermText } from "../propertyDetail";
import {
  isoDate,
  money,
  mortgageBlock,
  propertyLoanExposure,
  propertySchedules,
  rate,
} from "../../../engine";
import type { IsoDate, MortgageBlock } from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { mixedWithRefi } from "../../../engine/__tests__/support/synthetic";
import { devBlock } from "../../../engine/__tests__/support/mixed";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";

const d = en.propertyDetail;

function outlook(blocks: MortgageBlock[], asOf: IsoDate = BASE_DATE) {
  const pid = blocks[0].propertyId;
  const rows =
    propertySchedules(blocks, [pid], assumptions).get(pid)?.rows ?? [];
  const financing = propertyLoanExposure(blocks, assumptions, rows, asOf);
  if (!financing) throw new Error("no loan");
  return loanOutlook(financing, blocks, d);
}

const javorova = (p = portfolio) =>
  p.mortgages.filter((b) => b.propertyId === "javorova");

function block(id: string, start: string, fixationYears = 5): MortgageBlock {
  return mortgageBlock({
    id,
    propertyId: "p",
    startDate: isoDate(start),
    initialPrincipal: money("3000000"),
    fixationYears,
    interestRatePa: rate("0.04"),
    monthlyInstalment: money("14322.46"),
  });
}

describe("ADR 0117: loan outlook rows", () => {
  it("Javorova: the next reset on 17.01.2031 with the parity balance of month 56", () => {
    const o = outlook(javorova());
    expect(o.payoff).toBe("17.05.2051");
    expect(o.remainingTerm).toBe("25 yrs");
    expect(o.interestSaved).toBeNull();
    expect(o.resets).toHaveLength(1);
    const [row] = o.resets;
    expect(row).toMatchObject({
      blockId: "m-javorova",
      start: "17.01.2021",
      fixationEnd: "17.01.2031",
      status: "nextReset",
      label: d.outlookStatus.nextReset,
    });
    expect(row.balance!.minus(1386249.9).abs().toNumber()).toBeLessThanOrEqual(
      1,
    );
  });

  it("a refinanced chain: the old block is replaced, the new one is the next reset", () => {
    const o = outlook(javorova(mixedWithRefi));
    expect(o.resets.map((r) => [r.blockId, r.status, r.fixationEnd])).toEqual([
      ["m-javorova", "replaced", "17.01.2031"],
      ["m-refi", "nextReset", "17.01.2036"],
    ]);
    expect(o.resets[0].balance).toBeNull();
    expect(o.resets[0].label).toBe(d.outlookStatus.replaced);
  });

  it("a block replaced before baseDate is listed as replaced, oldest first", () => {
    const o = outlook([
      block("later", "2029-01-10"),
      block("old", "2018-03-10"),
      block("now", "2024-01-10"),
    ]);
    expect(o.resets.map((r) => [r.blockId, r.status, r.fixationEnd])).toEqual([
      ["old", "replaced", "10.03.2023"],
      ["now", "replaced", "10.01.2029"],
      ["later", "nextReset", "10.01.2034"],
    ]);
  });

  it("a floating block has no fixation end and no balance", () => {
    const o = outlook([block("float", "2024-01-10", 0)]);
    expect(o.resets).toEqual([
      expect.objectContaining({
        blockId: "float",
        fixationEnd: "—",
        balance: null,
        status: "floating",
        label: d.outlookStatus.floating,
      }),
    ]);
  });

  it("a refix on the fixation end stays replaced; a reset that happened has passed", () => {
    const blocks = [block("a", "2024-01-10", 3), block("b", "2027-01-10", 2)];
    const o = outlook(blocks, isoDate("2027-06-01"));
    expect(o.resets.map((r) => [r.blockId, r.status])).toEqual([
      ["a", "replaced"],
      ["b", "nextReset"],
    ]);
    const passed = outlook(javorova(), isoDate("2031-06-01"));
    expect(passed.resets[0]).toMatchObject({
      status: "passed",
      balance: null,
      label: d.outlookStatus.passed,
    });
  });

  it("a loan repaid before its fixation end: the reset is repaid", () => {
    const short = mortgageBlock({
      id: "short",
      propertyId: "p",
      startDate: isoDate("2025-06-10"),
      initialPrincipal: money("300000"),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money("14322.46"),
    });
    const o = outlook([short]);
    expect(o.resets[0]).toMatchObject({
      status: "repaid",
      balance: null,
      label: d.outlookStatus.repaid,
    });
  });

  it("an upcoming reset that is not the next one says upcoming", () => {
    const o = outlook([
      block("now", "2024-01-10"),
      block("next", "2030-01-10"),
    ]);
    expect(o.resets.map((r) => r.status)).toEqual(["nextReset", "upcoming"]);
    expect(o.resets[1].label).toBe(d.outlookStatus.upcoming);
    expect(o.resets[1].balance?.greaterThan(0)).toBe(true);
  });
});

describe("ADR 0117: loan outlook edge cases", () => {
  it("a 0-year block replaced before baseDate is replaced, with no fixation end", () => {
    const o = outlook([
      block("float", "2018-03-10", 0),
      block("now", "2024-01-10"),
    ]);
    expect(o.resets.map((r) => [r.blockId, r.status, r.fixationEnd])).toEqual([
      ["float", "replaced", "—"],
      ["now", "nextReset", "10.01.2029"],
    ]);
  });

  it("a floating block followed by a fixed one: floating, then the next rate reset", () => {
    const o = outlook([
      block("float", "2024-01-10", 0),
      block("next", "2027-01-10"),
    ]);
    expect(o.resets.map((r) => [r.blockId, r.status, r.fixationEnd])).toEqual([
      ["float", "floating", "—"],
      ["next", "nextReset", "10.01.2032"],
    ]);
  });

  it("a development loan's fixation end is its next rate reset", () => {
    const o = outlook([devBlock]);
    expect(o.resets).toEqual([
      expect.objectContaining({
        blockId: "m-dev",
        fixationEnd: "01.03.2031",
        status: "nextReset",
      }),
    ]);
    expect(o.resets[0].balance?.greaterThan(0)).toBe(true);
  });

  it("a loan repaid before baseDate: payoff Repaid, no term; its old fixation end passed", () => {
    const old = mortgageBlock({
      id: "old",
      propertyId: "p",
      startDate: isoDate("2010-01-10"),
      initialPrincipal: money("300000"),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money("14322.46"),
    });
    const o = outlook([old]);
    expect(o.payoff).toBe(d.loanPayoffNone);
    expect(o.remainingTerm).toBeNull();
    expect(o.resets[0]).toMatchObject({ status: "passed", balance: null });
  });

  it("just after payoff: the payoff date shows and the term is hidden", () => {
    const o = outlook(javorova(), isoDate("2051-05-20"));
    expect(o.payoff).toBe("17.05.2051");
    expect(o.remainingTerm).toBeNull();
  });
});

describe("ADR 0117: remaining term", () => {
  it.each([
    [300, "25 yrs"],
    [296, "24 yrs 8 months"],
    [13, "1 yr 1 month"],
    [7, "7 months"],
  ])("%i months reads %s", (months, text) => {
    expect(remainingTermText(months, d)).toBe(text);
  });

  it("uses the language's plurals", () => {
    expect(remainingTermText(296, cs.propertyDetail)).toBe("24 let 8 měsíců");
    expect(remainingTermText(296, ru.propertyDetail)).toBe("24 года 8 месяцев");
    expect(remainingTermText(13, ru.propertyDetail)).toBe("1 год 1 месяц");
  });

  it("is hidden once the loan is repaid", () => {
    const o = outlook(javorova(), isoDate("2052-01-01"));
    expect(o.remainingTerm).toBeNull();
  });
});
