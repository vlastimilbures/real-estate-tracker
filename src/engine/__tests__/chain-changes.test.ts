// ADR 0160: which stored loan events a change to a property's blocks stops, and which
// blocks the schedule does not use. The answer comes from the schedule itself
// (`propertySchedule`), so it matches the property page's REPLACED warnings.
import { describe, it, expect } from "vitest";
import { money } from "../brands";
import { isoDate } from "../dates";
import { loanChainChanges } from "../chainChanges";
import { propertySchedule } from "../schedule";
import type { MortgageBlock } from "../types";
import { assumptions } from "./support/seed";
import { loan } from "./support/loan";

const prepayment = (date: string) => ({
  date: isoDate(date),
  amount: money("300000"),
  effect: "shortenTerm" as const,
});
const recast = (date: string) => ({
  date: isoDate(date),
  maturity: isoDate("2049-01-17"),
});

/** Stored block 2021-01-17, in force at the seed baseDate 2026-06-07. */
const stored = (events: Partial<MortgageBlock>) =>
  loan({ id: "p", loanTermYears: 30, ...events } as never);
const successor = (id: string, start: string) =>
  loan({
    id,
    startDate: isoDate(start),
    initialPrincipal: money("1500000"),
    monthlyInstalment: money("12000"),
  });

const stopped = (before: MortgageBlock[], after: MortgageBlock[]) =>
  loanChainChanges(before, after, assumptions).stopped.map(
    (s) =>
      `${s.by} ${s.blockId} ${s.kind} ${s.date.toISOString().slice(0, 10)}`,
  );

describe("loanChainChanges — stopped events (ADR 0160)", () => {
  it("a successor stops the owner's later events, and recasts in its handover month", () => {
    const p = stored({
      prepayments: [prepayment("2031-01-17"), prepayment("2032-01-17")],
      recasts: [
        recast("2030-12-20"),
        recast("2031-01-17"),
        recast("2033-01-17"),
      ],
    });
    const b = successor("b", "2031-01-17");
    expect(stopped([p], [p, b])).toEqual([
      "b p recast 2030-12-20",
      "b p recast 2031-01-17",
      "b p prepayment 2032-01-17",
      "b p recast 2033-01-17",
    ]);
    // The oracle: the new schedule marks exactly those REPLACED; the prepayment on the
    // successor's start is paid at the handover.
    const after = propertySchedule([p, b], assumptions).eventOutcomes;
    expect(
      after.map(
        (o) => `${o.kind} ${o.date.toISOString().slice(0, 10)} ${o.issue}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        "prepayment 2031-01-17 null",
        "recast 2030-12-20 RECAST_REPLACED",
        "recast 2031-01-17 RECAST_REPLACED",
        "prepayment 2032-01-17 PREPAYMENT_REPLACED",
        "recast 2033-01-17 RECAST_REPLACED",
      ]),
    );
  });

  it("an event a stored successor already stopped is not stopped again", () => {
    const p = stored({
      prepayments: [prepayment("2033-01-17"), prepayment("2040-01-17")],
    });
    const c = successor("c", "2036-01-17");
    const b = successor("b", "2031-01-17");
    expect(stopped([p, c], [p, b, c])).toEqual(["b p prepayment 2033-01-17"]);
  });

  it("a new block in force at baseDate stops the old block's later events only", () => {
    const p = stored({
      prepayments: [prepayment("2024-01-17"), prepayment("2028-01-17")],
    });
    const b = successor("b", "2025-01-17");
    expect(stopped([p], [p, b])).toEqual(["b p prepayment 2028-01-17"]);
  });

  it("no change stops nothing", () => {
    const p = stored({ prepayments: [prepayment("2032-01-17")] });
    expect(stopped([p], [p])).toEqual([]);
  });
});

describe("loanChainChanges — unused blocks (ADR 0160)", () => {
  it("names a block that starts before the block in force", () => {
    const p = stored({});
    const early = successor("early", "2021-01-07");
    expect(loanChainChanges([p], [p, early], assumptions)).toEqual({
      stopped: [],
      unused: ["early"],
    });
  });

  it("every block is used when all start after baseDate", () => {
    const a = successor("a", "2027-01-17");
    const b = successor("b", "2026-12-17");
    expect(loanChainChanges([a], [a, b], assumptions).unused).toEqual([]);
  });
});
