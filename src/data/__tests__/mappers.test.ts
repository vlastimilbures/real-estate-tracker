// Data-layer mapper round-trip tests. These verify serialization between the engine's
// MortgageBlock domain type and the SQLite row shape — a data-layer concern, so they
// live here rather than under src/engine/__tests__ (keeps engine tests engine-only).
import { describe, it, expect } from "vitest";
import {
  rowToMortgageBlock,
  mortgageBlockToRow,
  type MortgageBlockRow,
} from "../mappers";
import { isoDate } from "../../engine";
import type { MortgageBlock } from "../../engine";
import { devFuture } from "../../engine/__tests__/support/loan";

// A construction loan with development fields: two tranche draws + a completion date.
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
