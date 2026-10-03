// A larger synthetic portfolio for benchmarks and equivalence tests (P9). The mixed
// fixture (seed + future buy + development loan + deactivated flat) plus a successor
// block on Javorova, cloned k = 0, 1, … times: every date shifted back k months and
// every id suffixed, then cut to `n` properties.
import { rate } from "../../brands";
import { edate, isoDate } from "../../dates";
import type { Portfolio } from "../../types";
import { mixed } from "./mixed";
import { money } from "../../brands";

/** `mixed` + a refinance: a successor block takes over Javorova at its refix. */
export const mixedWithRefi: Portfolio = {
  ...mixed,
  mortgages: [
    ...mixed.mortgages,
    {
      id: "m-refi",
      propertyId: "javorova",
      startDate: isoDate("2031-01-17"),
      initialPrincipal: money("1633000"),
      fixationYears: 5,
      interestRatePa: rate("0.039"),
      monthlyInstalment: money("9800"),
    },
  ],
};

// Shift every Date (also inside draws) back by k months and suffix ids, so clones
// are distinct properties with staggered timelines.
function shifted<T>(value: T, k: number, key = ""): T {
  if (value instanceof Date) return edate(value, -k) as T;
  if (Array.isArray(value)) return value.map((v) => shifted(v, k)) as T;
  if ((key === "id" || key === "propertyId") && typeof value === "string")
    return `${value}-c${k}` as T;
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [field, v] of Object.entries(value)) {
      out[field] = shifted(v, k, field);
    }
    return out as T;
  }
  return value;
}

/** `n` properties cloned from `mixedWithRefi`, with all their rows. */
export function synthetic(n: number): Portfolio {
  const per = mixedWithRefi.properties.length;
  const copies = Math.ceil(n / per);
  const all: Portfolio = {
    properties: [],
    mortgages: [],
    valuations: [],
    leases: [],
    holdingCosts: [],
  };
  for (let k = 0; k < copies; k++) {
    const c = shifted(mixedWithRefi, k);
    all.properties.push(...c.properties);
    all.mortgages.push(...c.mortgages);
    all.valuations.push(...c.valuations);
    all.leases.push(...c.leases);
    all.holdingCosts.push(...c.holdingCosts);
  }
  const keep = new Set(all.properties.slice(0, n).map((p) => p.id));
  const kept = <T extends { propertyId: string }>(rows: T[]) =>
    rows.filter((r) => keep.has(r.propertyId));
  return {
    properties: all.properties.filter((p) => keep.has(p.id)),
    mortgages: kept(all.mortgages),
    valuations: kept(all.valuations),
    leases: kept(all.leases),
    holdingCosts: kept(all.holdingCosts),
  };
}
