// UX-054 (D-29, D-30, DR-125, DR-130, DR-100): the loan warnings on Property detail.
// Every block from the one in force at baseDate onward is checked: instalment too low
// for the term, instalment-implied maturity ≠ contract maturity (> 1 month), and an
// expired fixation with no follow-on block.
import { describe, it, expect } from "vitest";
import { loanWarnings, loanWarningText } from "../propertyDetail";
import { impliedMaturity, isoDate, rate } from "../../../engine";
import type {
  LoanEventIssue,
  LoanEventOutcome,
  MortgageBlock,
} from "../../../engine";
import { D } from "../../../lib/money";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { fmtCzk } from "../../../lib/format";
import { money } from "../../../engine";

const baseDate = isoDate("2026-06-07");
const reset = rate("0.045");

function block(overrides: Partial<MortgageBlock> = {}): MortgageBlock {
  return {
    id: "m1",
    propertyId: "p1",
    startDate: isoDate("2021-01-17"),
    initialPrincipal: money("1912500"),
    fixationYears: 10,
    interestRatePa: rate("0.0169"),
    monthlyInstalment: money("6721.8"),
    ...overrides,
  } as MortgageBlock;
}

describe("loanWarnings", () => {
  it("a healthy loan has none; no loan has none", () => {
    expect(loanWarnings([block()], baseDate)).toEqual([]);
    expect(loanWarnings([], baseDate)).toEqual([]);
  });

  it("a loan not drawn yet is checked from its first block", () => {
    const later = block({
      id: "later",
      startDate: isoDate("2027-01-01"),
      loanTermYears: 5,
    });
    const ws = loanWarnings([later], baseDate);
    expect(ws.map((w) => [w.kind, w.block.id])).toEqual([
      ["underpays", "later"],
    ]);
  });

  it("warns when the instalment does not repay the loan by its term", () => {
    const b = block({ loanTermYears: 10 });
    const [w] = loanWarnings([b], baseDate);
    expect(w.kind).toBe("underpays");
    expect(w.block).toBe(b);
  });

  it("checks a follow-on block too (DR-125)", () => {
    const current = block();
    const next = block({
      id: "m2",
      startDate: isoDate("2031-01-17"),
      initialPrincipal: money("1630882"),
      loanTermYears: 5,
    });
    const ws = loanWarnings([current, next], baseDate);
    expect(ws.map((w) => [w.kind, w.block.id])).toEqual([["underpays", "m2"]]);
  });

  it("ignores a block already replaced before baseDate", () => {
    const old = block({
      id: "old",
      startDate: isoDate("2015-01-01"),
      loanTermYears: 5,
    });
    expect(loanWarnings([old, block()], baseDate)).toEqual([]);
  });

  it("warns when the contract maturity is more than a month off (D-29)", () => {
    const b = block();
    const implied = impliedMaturity(b)!;
    const ok = block({ contractMaturityDate: implied });
    expect(loanWarnings([ok], baseDate)).toEqual([]);
    const off = block({ contractMaturityDate: isoDate("2049-05-17") });
    const [w] = loanWarnings([off], baseDate);
    expect(w).toMatchObject({ kind: "maturity", implied, months: 24 });
  });

  it("warns when the fixation ended with no follow-on block (D-30)", () => {
    const b = block({ startDate: isoDate("2018-03-01"), fixationYears: 5 });
    const ws = loanWarnings([b], baseDate);
    expect(ws.map((w) => w.kind)).toContain("fixationEnded");
  });

  it("no fixation warning once a follow-on block is entered", () => {
    const b = block({ startDate: isoDate("2018-03-01"), fixationYears: 5 });
    const next = block({ id: "m2", startDate: isoDate("2023-03-01") });
    expect(
      loanWarnings([b, next], baseDate).filter(
        (w) => w.kind === "fixationEnded",
      ),
    ).toEqual([]);
  });

  it("development loans get no instalment or maturity checks", () => {
    const dev = block({
      loanTermYears: 2,
      completionDate: isoDate("2027-01-01"),
      contractMaturityDate: isoDate("2030-01-01"),
    });
    expect(loanWarnings([dev], baseDate)).toEqual([]);
  });
});

describe("loanWarningText", () => {
  it("maturity: the P02 §5 wording, in the user's language", () => {
    const off = block({ contractMaturityDate: isoDate("2049-05-17") });
    const [w] = loanWarnings([off], baseDate);
    const text = loanWarningText(en, w, reset);
    expect(text).toContain("Loan from 17.01.2021");
    expect(text).toContain(fmtCzk(D(6721.8)));
    expect(text).toContain("24 months after the contract maturity 17.05.2049");
    expect(loanWarningText(cs, w, reset)).toContain("24 měsíců po splatnosti");
  });

  it("fixation ended: names the end date and the assumed reset rate", () => {
    const b = block({ startDate: isoDate("2018-03-01"), fixationYears: 5 });
    const w = loanWarnings([b], baseDate).find(
      (x) => x.kind === "fixationEnded",
    )!;
    const text = loanWarningText(en, w, reset);
    expect(text).toContain("01.03.2023");
    expect(text).toContain("4,5 %");
  });
});

// ADR 0116 §10: an event the engine clamped, ignored or dropped is a warning, never a
// rejected save.
describe("event warnings", () => {
  const outcome = (
    issue: LoanEventOutcome["issue"],
    o: Partial<LoanEventOutcome> = {},
  ): LoanEventOutcome => ({
    blockId: "m1",
    kind: "prepayment",
    date: isoDate("2031-01-17"),
    month: 56,
    requested: D(500000),
    applied: D(400000),
    fee: D(0),
    issue,
    ...o,
  });

  it("an outcome with no issue is no warning", () => {
    expect(loanWarnings([block()], baseDate, [outcome(null)])).toEqual([]);
  });

  it("an outcome with an issue is a warning on its block, after the block checks", () => {
    const b = block({ startDate: isoDate("2018-03-01"), fixationYears: 5 });
    const ws = loanWarnings([b], baseDate, [
      outcome("PREPAYMENT_EXCEEDS_BALANCE"),
    ]);
    expect(ws.map((w) => w.kind)).toEqual(["fixationEnded", "event"]);
    expect(ws[1]!.block).toBe(b);
  });

  it("names the date, the amount asked for and the amount repaid", () => {
    const [w] = loanWarnings([block()], baseDate, [
      outcome("PREPAYMENT_EXCEEDS_BALANCE"),
    ]);
    const text = loanWarningText(en, w!, reset);
    expect(text).toContain("Loan from 17.01.2021:");
    expect(text).toContain("17.01.2031");
    expect(text).not.toMatch(/undefined/);
    expect(text).toContain(fmtCzk(D(500000)));
    expect(text).toContain(fmtCzk(D(400000)));
  });

  it("has a sentence for every issue, in every language", () => {
    const issues = Object.keys(
      en.propertyDetail.eventIssue,
    ) as LoanEventIssue[];
    expect(issues).toHaveLength(7);
    for (const dict of [en, cs, ru]) {
      for (const issue of issues) {
        const kind = issue.startsWith("RECAST") ? "recast" : "prepayment";
        const [w] = loanWarnings([block()], baseDate, [
          outcome(issue, { kind }),
        ]);
        expect(loanWarningText(dict, w!, reset)).toContain("17.01.2031");
      }
    }
  });

  it("skips an outcome of a block the page does not list", () => {
    expect(
      loanWarnings([block()], baseDate, [
        outcome("PREPAYMENT_AFTER_PAYOFF", { blockId: "gone" }),
      ]),
    ).toEqual([]);
  });
});
