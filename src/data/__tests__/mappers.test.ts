// Data-layer mapper round-trip tests. These verify serialization between the engine's
// MortgageBlock domain type and the SQLite row shape — a data-layer concern, so they
// live here rather than under src/engine/__tests__ (keeps engine tests engine-only).
import { describe, it, expect } from "vitest";
import {
  rowToMortgageBlock,
  mortgageBlockToRow,
  type MortgageBlockRow,
} from "../mappers";
import { isoDate, rate } from "../../engine";
import type { MortgageBlock } from "../../engine";
import { money } from "../../engine";

// A construction loan with development fields: two tranche draws + a completion date.
const devFuture: MortgageBlock = {
  id: "dev-future",
  propertyId: "javorova",
  startDate: isoDate("2026-09-01"),
  initialPrincipal: money("2000000"),
  fixationYears: 10,
  interestRatePa: rate("0.05"),
  monthlyInstalment: money("10000"),
  loanTermYears: 30,
  draws: [
    { date: isoDate("2027-03-01"), amount: money("1500000") },
    { date: isoDate("2027-09-01"), amount: money("2000000") },
  ],
  completionDate: isoDate("2027-12-01"),
};

describe("mapper round-trip for development fields", () => {
  it("preserves draws + completion date through row ⇄ block", () => {
    const row = mortgageBlockToRow(devFuture);
    expect(row.interest_only_until).toBe("2027-12-01");
    const back = rowToMortgageBlock({ ...row } as MortgageBlockRow);
    expect(back.draws?.length).toBe(2);
    expect(back.draws![0].amount.toString()).toBe("1500000");
    expect(back.completionDate?.getTime()).toBe(
      isoDate("2027-12-01").getTime(),
    );
  });

  it("a legacy single-draw block serializes draws as NULL (not '[]')", () => {
    const plain: MortgageBlock = {
      ...devFuture,
      draws: undefined,
      completionDate: undefined,
    };
    const row = mortgageBlockToRow(plain);
    expect(row.draws).toBeNull();
    expect(row.interest_only_until).toBeNull();
    expect(
      rowToMortgageBlock({ ...row } as MortgageBlockRow).draws,
    ).toBeUndefined();
  });
});
