// P9 engine benchmarks ("Node bench"; `pnpm bench`). The recompute cases time the same
// engine calls as the hooks in src/state/useEngine.ts: `useEngine` for one portfolio,
// `useScenarioComparison` for a 3-scenario compare. Report mean and p99.
import { bench, describe } from "vitest";
import { D } from "../../../lib/money";
import { rate } from "../../brands";
import { irr } from "../../kpis";
import { schedulesByProperty } from "../../schedule";
import {
  applyScenario,
  cpiIndex,
  portfolioKpis,
  portfolioOutputs,
  portfolioProjection,
  projectionAndKpis,
  realProjection,
  type Assumptions,
  type Portfolio,
  type ScenarioOverrides,
} from "../..";
import { assumptions, portfolio as seed } from "../support/seed";
import { synthetic } from "../support/synthetic";

const p20 = synthetic(20);

/** The `useEngine` memo body (whole portfolio, as-of = baseDate). */
function recompute(p: Portfolio, a: Assumptions = assumptions) {
  return portfolioOutputs(p, a, a.baseDate);
}

const SCENARIOS: ScenarioOverrides[] = [
  {},
  { appreciationPa: rate("0.02"), vacancyAllowance: rate("0.1") },
  {
    inflationShock: { deltaPa: rate("0.05"), durationYears: 3 },
    rateShock: { deltaPa: rate("0.02"), durationYears: 5 },
    valueShock: { pct: rate("0.2"), atYear: 2 },
  },
];

/** The `useScenarioComparison` memo body. */
function compare(p: Portfolio) {
  return SCENARIOS.map((o) => {
    const a = applyScenario(assumptions, o);
    const { projection, kpis } = projectionAndKpis(p, a);
    return {
      projection,
      realProjection: realProjection(projection, cpiIndex(a)),
      kpis,
    };
  });
}

// A typical levered vector: equity in, 29 years of cash flow, sale at the horizon.
const vector = [
  D(-5000000),
  ...Array.from({ length: 29 }, (_, t) => D(120000 + 4000 * t)),
  D(14000000),
];

const opts = { iterations: 30, warmupIterations: 3 };

describe("recompute (useEngine)", () => {
  bench("seed, 3 properties", () => void recompute(seed), opts);
  bench("synthetic, 20 properties", () => void recompute(p20), opts);
});

describe("scenario compare (3 scenarios)", () => {
  bench("seed, 3 properties", () => void compare(seed), opts);
  bench("synthetic, 20 properties", () => void compare(p20), opts);
});

describe("pieces, synthetic 20 properties", () => {
  const ids = p20.properties.map((x) => x.id);
  bench(
    "schedulesByProperty",
    () => void schedulesByProperty(p20.mortgages, ids, assumptions),
    opts,
  );
  bench(
    "portfolioProjection",
    () => void portfolioProjection(p20, assumptions),
    opts,
  );
  bench("portfolioKpis", () => void portfolioKpis(p20, assumptions), opts);
  bench("irr (31 cash flows)", () => void irr(vector), opts);
});
