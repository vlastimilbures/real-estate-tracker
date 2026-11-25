// The blocks derived from a block (#477): cut at a successor's start, or without its
// prepayments. Both keep the block's term, so a development loan stays one.
import { describe, expect, it } from "vitest";
import { isoDate } from "../dates";
import { money } from "../brands";
import { cutAfter, withoutPrepayments } from "../loanBlock";
import { loan } from "./support/loan";

const dev = loan({
  loanTermYears: 30,
  draws: [
    { date: isoDate("2021-06-01"), amount: money("100000") },
    { date: isoDate("2022-06-01"), amount: money("100000") },
  ],
  prepayments: [
    {
      date: isoDate("2022-06-01"),
      amount: money("50000"),
      effect: "shortenTerm",
    },
    {
      date: isoDate("2022-06-02"),
      amount: money("50000"),
      effect: "shortenTerm",
    },
  ],
  recasts: [{ date: isoDate("2023-01-17"), maturity: isoDate("2045-01-17") }],
});

describe("cutAfter", () => {
  it("drops the tranches, prepayments and recasts dated after the date, keeping those on it", () => {
    const cut = cutAfter(dev, isoDate("2022-06-01"));
    expect(cut.draws?.map((d) => d.date)).toEqual([
      isoDate("2021-06-01"),
      isoDate("2022-06-01"),
    ]);
    expect(cut.prepayments?.map((p) => p.date)).toEqual([
      isoDate("2022-06-01"),
    ]);
    expect(cut.recasts).toEqual([]);
    expect(cut.loanTermYears).toBe(30);
    expect(dev.prepayments).toHaveLength(2); // the input is not mutated
  });

  it("returns the same block when nothing is dated after the date", () => {
    expect(cutAfter(dev, isoDate("2023-01-17"))).toBe(dev);
    const plain = loan({});
    expect(cutAfter(plain, isoDate("2021-01-17"))).toBe(plain);
  });
});

describe("withoutPrepayments", () => {
  it("drops the prepayments and keeps the recasts and tranches", () => {
    const b = withoutPrepayments(dev);
    expect(b.prepayments).toBeUndefined();
    expect(b.recasts).toBe(dev.recasts);
    expect(b.draws).toBe(dev.draws);
    expect(b.loanTermYears).toBe(30);
  });

  it("returns the same block when it has no prepayment", () => {
    const plain = loan({});
    expect(withoutPrepayments(plain)).toBe(plain);
    const empty = loan({ prepayments: [] });
    expect(withoutPrepayments(empty)).toBe(empty);
  });
});
