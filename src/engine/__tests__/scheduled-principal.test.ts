// #481 (ADR 0167): a loan's total scheduled principal, the start draw plus every
// tranche, is one engine sum. It reads only the principal and the tranches, so the
// mortgage form's drawdown total can run it on the rows being edited.
import { describe, it, expect } from "vitest";
import { principalDrawnBy, scheduledPrincipal } from "../growth";
import { isoDate } from "../dates";
import { money } from "../brands";
import { devBlock } from "./support/mixed";

describe("scheduledPrincipal", () => {
  it("is the start draw plus every tranche", () => {
    expect(scheduledPrincipal(devBlock).toString()).toBe("4500000");
  });

  it("is the start draw alone without tranches", () => {
    expect(
      scheduledPrincipal({ initialPrincipal: money("1200000") }).toString(),
    ).toBe("1200000");
    expect(
      scheduledPrincipal({
        initialPrincipal: money("1200000"),
        draws: [],
      }).toString(),
    ).toBe("1200000");
  });

  it("takes the start draw and tranches alone, keeping fractions", () => {
    const total = scheduledPrincipal({
      initialPrincipal: money("1200000.5"),
      draws: [
        { date: isoDate("2027-01-01"), amount: money("0.25") },
        { date: isoDate("2026-01-01"), amount: money("1000000") },
      ],
    });
    expect(total.toString()).toBe("2200000.75");
  });

  it("counts only the tranches dated by a cutoff", () => {
    const by = (d: string) => principalDrawnBy(devBlock, isoDate(d)).toString();
    expect(by("2026-11-14")).toBe("2000000");
    expect(by("2026-11-15")).toBe("3500000");
    expect(by("2027-08-20")).toBe("4500000");
  });
});
