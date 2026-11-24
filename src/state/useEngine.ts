// The single recompute path. Every hook reads the engine model of the store's current
// (portfolio, assumptions) (#469): any edit produces new references in the store, so a
// new model runs the pure engine and pushes fresh output to every screen, while views of
// unchanged data are built once and shared across hooks and page visits. Components
// consume this — they never call the engine inline.
import { useMemo } from "react";
import { usePortfolioStore } from "./portfolioStore";
import { serializeOverrides } from "../data/mappers";
import { todayUtc } from "../lib/day";
import { timed } from "../lib/perf";
import {
  getEngineModel,
  type EngineModel,
  type EngineOutput,
  type Projections,
  type PropertyResult,
} from "./engineModel";
import {
  projectionAndKpis,
  applyScenario,
  cpiIndex,
  realProjection,
  comparableScenarios,
  utc,
} from "../engine";
import type {
  Scenario,
  PortfolioKPIs,
  ProjectionYear,
  IsoDate,
} from "../engine";

/**
 * The as-of date the engine sees: the picked date or today, never before baseDate
 * (D-19 default max(today, baseDate); the engine rejects an earlier one). The pages pass
 * a date already resolved into the window (`resolveAsOf`, ADR 0150). UI-boundary dates are UTC midnight by construction (todayUtc,
 * DateInput, AsOfPicker); `utc` rebuilds the same day as a branded IsoDate (D-25). The
 * model keys on getTime(), so the fresh object does not trigger a recompute.
 */
function engineAsOf(asOf: Date | null | undefined, baseDate: Date): IsoDate {
  const picked = asOf ?? todayUtc();
  const day = picked < baseDate ? baseDate : picked;
  return utc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
}

/** The engine model of the store's data, or null until the store has loaded. */
function useEngineModel(): EngineModel | null {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  return portfolio && assumptions
    ? getEngineModel(portfolio, assumptions)
    : null;
}

/**
 * Portfolio-wide engine output, or null until the store has loaded.
 *
 * Pass `propertyIds` to compute over a subset (e.g. the Dashboard filter). The
 * engine sees only the kept properties and their rows, so the other properties'
 * rows are not orphans to it (D-37); the returned `portfolio` keeps the other
 * arrays whole. Empty/undefined = whole portfolio (default for all callers). A new
 * array with the same ids, in any order, returns the same output.
 */
export function useEngine(
  propertyIds?: string[] | null,
  asOf?: Date | null,
): EngineOutput | null {
  const model = useEngineModel();
  if (!model) return null;
  return model.outputs(
    propertyIds ?? [],
    engineAsOf(asOf, model.assumptions.baseDate),
  );
}

export interface ScenarioResult {
  id: string;
  name: string;
  projection: ProjectionYear[];
  /** The projection in real terms, deflated by this scenario's CPI (D-23, UX-055). */
  realProjection: ProjectionYear[];
  kpis: PortfolioKPIs;
}

/**
 * Run the engine once per scenario over the shared portfolio + base assumptions:
 * `applyScenario` folds the overrides (including the time-aware shock descriptors) onto
 * the assumptions; the engine reads them where relevant (CPI, the value-crash, the
 * amortization rate). Base = a scenario with empty overrides ⇒ identical to `useEngine`.
 * A scenario whose own overrides break an engine rule is left out instead of throwing
 * during render (ADR 0123); the caller names it from the ids missing in the result.
 * Returns one result per remaining scenario, in order, or null until the store has
 * loaded.
 */
export function useScenarioComparison(
  scenarios: Scenario[],
): ScenarioResult[] | null {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  // Stable dep: re-run only when a selected scenario's id or overrides change. The key is
  // the stored form, which the restore tests keep complete; a per-field test pins that
  // each field re-runs the compare (#147).
  const key = scenarios
    .map((s) => `${s.id}:${serializeOverrides(s.overrides)}`)
    .join("|");
  const computed = useMemo(() => {
    if (!portfolio || !assumptions) return null;
    return timed("scenario-compare", () =>
      comparableScenarios(assumptions, scenarios).map((s) => {
        const assn = applyScenario(assumptions, s.overrides);
        const { projection, kpis } = projectionAndKpis(portfolio, assn);
        return {
          id: s.id,
          projection,
          realProjection: realProjection(projection, cpiIndex(assn)),
          kpis,
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, assumptions, key]);
  // Names are attached outside the engine memo: a rename shows at once without
  // re-running the engine (DR-055). By id, since a left-out scenario shifts positions.
  const names = scenarios.map((s) => s.name).join("\u0000");
  return useMemo(() => {
    if (!computed) return null;
    const nameOf = new Map(scenarios.map((s) => [s.id, s.name]));
    return computed.map((r) => ({ ...r, name: nameOf.get(r.id) ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed, names]);
}

/** The portfolio's and every property's year-by-year projection, from one set of loan
 *  schedules (Projections grid). */
export function useProjections(): Projections | null {
  return useEngineModel()?.projections() ?? null;
}

/** Every property's projection by id, inactive ones included, without the portfolio
 *  sum: the Properties rows read their Today basis from it (ADR 0150). */
export function usePropertyProjections(): Map<string, ProjectionYear[]> | null {
  return useEngineModel()?.propertyProjections() ?? null;
}

/**
 * Per-property engine output for the detail screen, or the engine's input error when the
 * stored data breaks a rule, so the page can still show the records to fix (DR-146).
 * What does not depend on the as-of date is built once per data change (#174).
 */
export function usePropertyEngineResult(
  propertyId: string | null,
  asOf?: Date | null,
): PropertyResult {
  const model = useEngineModel();
  if (!model || propertyId === null) return null;
  return model.property(
    propertyId,
    engineAsOf(asOf, model.assumptions.baseDate),
  );
}
