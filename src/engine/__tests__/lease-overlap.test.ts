// ADR 0163: leases of one apartment never overlap. `overlappingLeases` finds the pairs that
// do (stored before the rule); `leaseOverlapErrors` is the write-time rule. Restore and the
// engine's own input checks do not apply it, so stored overlaps still load.
import { describe, it, expect } from "vitest";
import { money } from "../brands";
import { isoDate } from "../dates";
import { overlappingLeases } from "../succession";
import {
  leaseOverlapErrors,
  validateInputs,
  validatePortfolio,
} from "../validate";
import type { Lease, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { mixed } from "./support/mixed";

const lease = (
  id: string,
  start: string,
  end?: string,
  propertyId = "javorova",
): Lease => ({
  id,
  propertyId,
  startDate: isoDate(start),
  ...(end !== undefined && { endDate: isoDate(end) }),
  monthlyRent: money("20000"),
});
const pairs = (leases: Lease[]) =>
  overlappingLeases(leases).map(([a, b]) => `${a.id}+${b.id}`);
const withLeases = (leases: Lease[]): Portfolio => ({ ...portfolio, leases });

describe("overlappingLeases", () => {
  it("an open lease and a later one overlap", () =>
    expect(pairs([lease("a", "2024-01-01"), lease("b", "2027-01-01")])).toEqual(
      ["a+b"],
    ));

  it("a dated lease inside an open one overlaps, whatever the input order", () =>
    expect(
      pairs([lease("b", "2027-01-01", "2027-03-31"), lease("a", "2024-01-01")]),
    ).toEqual(["a+b"]));

  it("an end on the next start overlaps: both are in force that day", () =>
    expect(
      pairs([lease("a", "2025-01-01", "2025-12-31"), lease("b", "2025-12-31")]),
    ).toEqual(["a+b"]));

  it("the same start overlaps", () =>
    expect(pairs([lease("a", "2025-01-01"), lease("b", "2025-01-01")])).toEqual(
      ["a+b"],
    ));

  it("lists every overlapping pair", () =>
    expect(
      pairs([
        lease("a", "2020-01-01"),
        lease("b", "2025-01-01", "2025-06-30"),
        lease("c", "2026-01-01"),
      ]),
    ).toEqual(["a+b", "a+c"]));

  it("back-to-back leases and a gap do not overlap", () =>
    expect(
      pairs([
        lease("a", "2025-01-01", "2025-12-31"),
        lease("b", "2026-01-01", "2026-06-30"),
        lease("c", "2026-09-01"),
      ]),
    ).toEqual([]));

  it("leases of different properties never overlap", () =>
    expect(
      pairs([
        lease("a", "2025-01-01", undefined, "javorova"),
        lease("b", "2025-01-01", undefined, "dubova"),
      ]),
    ).toEqual([]));

  it("the seed and the mixed fixture have none", () => {
    expect(pairs(portfolio.leases)).toEqual([]);
    expect(pairs(mixed.leases)).toEqual([]);
  });
});

describe("leaseOverlapErrors", () => {
  it("reports LEASE_OVERLAP on both leases of a pair, at the start date", () =>
    expect(
      leaseOverlapErrors(
        withLeases([lease("a", "2024-01-01"), lease("b", "2027-01-01")]),
      ),
    ).toEqual([
      { code: "LEASE_OVERLAP", entity: "lease", id: "a", field: "startDate" },
      { code: "LEASE_OVERLAP", entity: "lease", id: "b", field: "startDate" },
    ]));

  it("names a lease once even when it overlaps several", () =>
    expect(
      leaseOverlapErrors(
        withLeases([
          lease("a", "2020-01-01"),
          lease("b", "2025-01-01", "2025-06-30"),
          lease("c", "2026-01-01"),
        ]),
      ).map((e) => e.id),
    ).toEqual(["a", "b", "c"]));

  it("is empty for the seed", () =>
    expect(leaseOverlapErrors(portfolio)).toEqual([]));

  it("is not one of the input rules, so a stored overlap still loads and restores", () => {
    const p = withLeases([lease("a", "2024-01-01"), lease("b", "2027-01-01")]);
    expect(validatePortfolio(p)).toEqual([]);
    expect(validateInputs(p, assumptions)).toEqual([]);
  });
});
