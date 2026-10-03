// DR-045 (ADR 0080): projection rent follows the leases month by month. Each grid month
// (baseDate + m months, D-21) takes the rent of the lease in force on its grid date; a
// gap between leases earns nothing; a new lease's rent replaces the old one and is indexed
// from its own turn-on year; the last lease keeps renting after its end date.
// Seed baseDate 2026-06-07 ⇒ grid month m falls on the 7th: m = 1 → 2026-07-07,
// m = 6 → 2026-12-07, m = 7 → 2027-01-07. Rent indexation 3 %.
import { describe, it } from "vitest";
import { isoDate } from "../dates";
import { propertyProjection } from "../projections";
import { schedulesByProperty } from "../schedule";
import type { Lease, Portfolio, Property } from "../types";
import { money } from "../brands";
import { assumptions, portfolio } from "./support/seed";
import { KC, near } from "./support/tolerance";

const owned: Property = {
  id: "p",
  name: "Test flat",
  purchaseDate: isoDate("2020-01-01"),
  purchasePrice: money("5000000"),
};

const lease = (
  id: string,
  start: string,
  rent: number,
  end?: string,
): Lease => ({
  id,
  propertyId: "p",
  startDate: isoDate(start),
  endDate: end === undefined ? undefined : isoDate(end),
  monthlyRent: money(rent),
});

/** Gross rent per projection year (index = year) for `property` with `leases`. */
function rentByYear(leases: Lease[], property: Property = owned): number[] {
  const p: Portfolio = {
    properties: [property],
    mortgages: [],
    valuations: [],
    leases,
    holdingCosts: [],
  };
  return propertyProjection(property, p, assumptions, []).map((y) =>
    y.grossRent.toNumber(),
  );
}

const A = 20_000;
const B = 22_000;

describe("lease steps and gaps on the month grid (DR-045)", () => {
  it("steps to the new lease's rent from its first grid month", () => {
    const r = rentByYear([
      lease("a", "2025-01-01", A, "2026-12-31"),
      lease("b", "2027-01-01", B),
    ]);
    near(r[1]!, 6 * A * 1.03 + 6 * B, KC, "year 1");
    near(r[2]!, 12 * B * 1.03, KC, "year 2");
    near(r[3]!, 12 * B * 1.03 ** 2, KC, "year 3");
  });

  it("a gap holding a grid date earns no rent that month", () => {
    const r = rentByYear([
      lease("a", "2025-01-01", A, "2026-12-31"),
      lease("b", "2027-02-01", B), // grid month 7 (2027-01-07) is empty
    ]);
    near(r[1]!, 6 * A * 1.03 + 5 * B, KC, "year 1");
    near(r[2]!, 12 * B * 1.03, KC, "year 2");
  });

  it("a gap holding no grid date costs nothing", () => {
    const r = rentByYear([
      lease("a", "2025-01-01", A, "2026-12-30"), // 31 Dec uncovered
      lease("b", "2027-01-01", B),
    ]);
    near(r[1]!, 6 * A * 1.03 + 6 * B, KC, "year 1");
  });

  it("the last lease keeps renting after its end date", () => {
    const r = rentByYear([lease("a", "2025-01-01", A, "2027-01-31")]);
    for (const t of [1, 2, 5, 30]) {
      near(r[t]!, 12 * A * 1.03 ** t, KC, `year ${t}`);
    }
  });

  it("a last lease that ended before baseDate gives no rent", () => {
    const r = rentByYear([lease("a", "2025-01-01", A, "2026-05-31")]);
    for (const t of [1, 2, 30]) near(r[t]!, 0, KC, `year ${t}`);
  });

  it("an earlier lease that ends gives way to the later one; the later one renews", () => {
    const r = rentByYear([
      lease("a", "2025-01-01", A), // open-ended
      lease("b", "2027-01-01", B, "2027-06-30"), // later start wins from month 7
    ]);
    near(r[1]!, 6 * A * 1.03 + 6 * B, KC, "year 1");
    near(r[2]!, 12 * B * 1.03, KC, "year 2");
  });

  it("a future buy rents from its first owned month and steps on the grid", () => {
    const future: Property = {
      ...owned,
      purchaseDate: isoDate("2027-03-15"), // first owned grid month 10 (2027-04-07)
    };
    const r = rentByYear(
      [
        lease("a", "2027-03-15", A, "2027-12-31"), // months 10–18
        lease("b", "2028-01-01", B), // from month 19 (2028-01-07), year 2
      ],
      future,
    );
    near(r[1]!, 3 * A, KC, "year 1");
    near(r[2]!, 6 * A * 1.03 + 6 * B, KC, "year 2");
    near(r[3]!, 12 * B * 1.03, KC, "year 3");
  });
});

describe("seed: Lipova steps 21,675 → 23,205 on 2026-09-01 (DR-045)", () => {
  const schedules = schedulesByProperty(
    portfolio.mortgages,
    portfolio.properties.map((p) => p.id),
    assumptions,
  );
  const lipova = portfolio.properties.find((p) => p.id === "lipova")!;
  const proj = propertyProjection(
    lipova,
    portfolio,
    assumptions,
    schedules.get("lipova") ?? [],
  );

  it("year 1: two months at the old rent, ten at the new", () =>
    near(
      proj[1]!.grossRent.toNumber(),
      2 * 21_675 * 1.03 + 10 * 23_205,
      KC,
      "year 1",
    ));
  it("year 2 indexes the new rent from its own turn-on year", () =>
    near(proj[2]!.grossRent.toNumber(), 12 * 23_205 * 1.03, KC, "year 2"));
});
