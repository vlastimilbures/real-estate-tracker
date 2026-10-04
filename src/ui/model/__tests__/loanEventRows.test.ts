// ADR 0116 §11: the mortgage form's prepayment and recast rows. A draft holds the rows as
// one JSON string, blank rows are ignored, a row that does not parse fails the list, and
// an engine error's index maps back to the row it came from.
import { describe, it, expect } from "vitest";
import { isoDate, money } from "../../../engine";
import {
  draftRowOf,
  parsePrepaymentRows,
  parseRecastRows,
  prepaymentsDraft,
  readRows,
  recastsDraft,
  rowProblems,
  writeRows,
  type PrepaymentRow,
  type RecastRow,
} from "../loanEventRows";

const pre = (r: Partial<PrepaymentRow> = {}): PrepaymentRow => ({
  date: "17.01.2031",
  amount: "500000",
  effect: "shortenTerm",
  fee: "",
  ...r,
});
const rec = (r: Partial<RecastRow> = {}): RecastRow => ({
  date: "17.01.2032",
  mode: "maturity",
  value: "17.01.2045",
  ...r,
});
const blankPre = pre({ date: "", amount: "" });

describe("loan event rows", () => {
  it("round-trips stored events through the draft, in stored order", () => {
    const stored = [
      {
        date: isoDate("2031-01-17"),
        amount: money("500000"),
        effect: "lowerInstalment" as const,
        fee: money("1500.5"),
      },
      {
        date: isoDate("2032-01-17"),
        amount: money(100000),
        effect: "shortenTerm" as const,
      },
    ];
    expect(parsePrepaymentRows(prepaymentsDraft(stored))).toEqual(stored);
    const recasts = [
      { date: isoDate("2031-01-17"), maturity: isoDate("2045-01-17") },
      { date: isoDate("2033-01-17"), instalment: money(9000) },
    ];
    expect(parseRecastRows(recastsDraft(recasts))).toEqual(recasts);
  });

  it("keeps a stored amount's precision through the draft (ADR 0131)", () => {
    const stored = [
      {
        date: isoDate("2031-01-17"),
        amount: money("500000.005"),
        effect: "lowerInstalment" as const,
        fee: money("1500.125"),
      },
    ];
    expect(parsePrepaymentRows(prepaymentsDraft(stored))).toEqual(stored);
    const recasts = [
      { date: isoDate("2033-01-17"), instalment: money("9000.005") },
    ];
    expect(parseRecastRows(recastsDraft(recasts))).toEqual(recasts);
  });

  it("an empty list is an empty draft, and back", () => {
    expect(prepaymentsDraft(undefined)).toBe("");
    expect(recastsDraft([])).toBe("");
    expect(writeRows([])).toBe("");
    expect(readRows("")).toEqual([]);
    expect(parsePrepaymentRows("")).toEqual([]);
  });

  it("ignores blank rows and keeps the draft order", () => {
    const draft = writeRows([
      pre({ date: "17.01.2033" }),
      blankPre,
      pre({ date: "17.01.2031" }),
    ]);
    expect(parsePrepaymentRows(draft)?.map((p) => p.date)).toEqual([
      isoDate("2033-01-17"),
      isoDate("2031-01-17"),
    ]);
  });

  it("names the cells of a row that does not parse, and fails the list", () => {
    expect(rowProblems(pre())).toEqual([]);
    expect(rowProblems(blankPre)).toEqual([]);
    expect(rowProblems(pre({ date: "31.02.2031", amount: "0" }))).toEqual([
      "date",
      "amount",
    ]);
    expect(rowProblems(pre({ fee: "-1" }))).toEqual(["fee"]);
    expect(rowProblems(rec({ value: "2045" }))).toEqual(["value"]);
    expect(rowProblems(rec({ mode: "instalment", value: "9 000" }))).toEqual(
      [],
    );
    expect(
      parsePrepaymentRows(writeRows([pre(), pre({ amount: "x" })])),
    ).toBeNull();
    expect(parseRecastRows(writeRows([rec({ date: "" })]))).toBeNull();
  });

  it("maps an engine index (position among non-blank rows) to its draft row", () => {
    const draft = writeRows([blankPre, pre(), blankPre, pre()]);
    expect(draftRowOf(draft, 0)).toBe(1);
    expect(draftRowOf(draft, 1)).toBe(3);
    expect(draftRowOf(draft, 2)).toBeNull();
  });
});
