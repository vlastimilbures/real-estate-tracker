// Scenario-compare results for tests (#458).
import {
  applyScenario,
  cpiIndex,
  portfolioProjection,
  realProjection,
  type ScenarioOverrides,
} from "../../../engine";
import { portfolioKpis } from "../../../engine/__tests__/support/seams";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import type { CompareResult } from "../../model/compare";

/** The seed portfolio run under `overrides`, as the compare view gets it. */
export function compareResult(
  id: string,
  name: string = id,
  overrides: ScenarioOverrides = {},
): CompareResult {
  const assn = applyScenario(assumptions, overrides);
  const projection = portfolioProjection(portfolio, assn);
  return {
    id,
    name,
    projection,
    realProjection: realProjection(projection, cpiIndex(assn)),
    kpis: portfolioKpis(portfolio, assn),
  };
}

/** The body of a `vi.mock("…/state/useEngine", …)` factory: the comparison returns
 *  whatever `results()` gives at render time, so a test can swap the list between
 *  renders. The `vi.mock` call itself stays in the test file, where Vitest hoists it. */
export function mockScenarioComparison(results: () => CompareResult[]) {
  return { useScenarioComparison: () => results() };
}
