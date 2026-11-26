// One engine model per data version. The store replaces `portfolio` and `assumptions` on
// every write, so a model keyed on the two objects is never stale: each hook reads from
// it, a page that needs several views builds the loan schedules once, and a revisit with
// unchanged data costs nothing. A pure memo layer over engine calls: no clock, no IO (the
// hooks resolve "today"). A throw is not kept, so the next read throws again, as a
// throwing useMemo did.
import { timed } from "../lib/perf";
import {
  acquisitionSummary,
  applyScenario,
  comparableScenarios,
  cpiIndex,
  projectionAndKpis,
  realProjection,
  portfolioOutputs,
  portfolioProjection,
  propertyLoanExposure,
  propertyProjection,
  propertyProjections,
  propertySchedules,
  propertySnapshot,
  EMPTY_PROPERTY_SCHEDULE,
  EngineInputError,
} from "../engine";
import type {
  AcquisitionSummary,
  AmortizationRow,
  Assumptions,
  FinancingExposure,
  IsoDate,
  LoanEventOutcome,
  MortgageBlock,
  Portfolio,
  PortfolioKPIs,
  PortfolioSnapshot,
  ProjectionYear,
  Property,
  PropertyLoan,
  PropertySchedule,
  PropertySnapshot,
  Scenario,
  ScenarioOverrides,
} from "../engine";

export interface EngineOutput {
  portfolio: Portfolio;
  assumptions: Assumptions;
  snapshot: PortfolioSnapshot;
  projection: ProjectionYear[];
  kpis: PortfolioKPIs;
  schedules: Map<string, AmortizationRow[]>;
  /** Next fixations, payoffs and fixation ends at the as-of date (ADR 0103). */
  financing: FinancingExposure;
}

export interface Projections {
  portfolio: ProjectionYear[];
  /** Every property's projection by id, inactive ones included (the page filters). */
  byProperty: Map<string, ProjectionYear[]>;
}

export interface PropertyEngineOutput {
  /** The as-of date the snapshot was evaluated at (picked or today, ≥ baseDate). */
  asOf: IsoDate;
  snapshot: PropertySnapshot;
  projection: ProjectionYear[];
  schedule: AmortizationRow[];
  /** What the loan's prepayments and recasts did (ADR 0109, shown as warnings: ADR 0116). */
  eventOutcomes: LoanEventOutcome[];
  /** Modelled payoff, interest saved (ADR 0116) and each block's reset (ADR 0117); null
   *  without a loan. */
  financing: PropertyLoan | null;
  /** The purchase's sources and uses (ADR 0119 §4, §9). */
  acquisition: AcquisitionSummary;
}

/** Stored data that breaks an engine rule, reported instead of thrown. */
export interface InvalidPropertyData {
  invalid: EngineInputError;
}

export interface ScenarioResult {
  id: string;
  name: string;
  projection: ProjectionYear[];
  /** The projection in real terms, deflated by this scenario's CPI (ADR 0023). */
  realProjection: ProjectionYear[];
  kpis: PortfolioKPIs;
}

export type PropertyResult = PropertyEngineOutput | InvalidPropertyData | null;

/** Every engine view of one portfolio and assumptions, each built on first read. */
export interface EngineModel {
  assumptions: Assumptions;
  /** Portfolio-wide output over `ids` (empty = every property) at `asOf`. */
  outputs(ids: readonly string[], asOf: IsoDate): EngineOutput;
  projections(): Projections;
  propertyProjections(): Map<string, ProjectionYear[]>;
  /** One property's output at `asOf`, its input error, or null for an unknown id. */
  property(id: string, asOf: IsoDate): PropertyResult;
  /** One result per scenario that breaks no engine rule, in order (ADR 0123). */
  compare(scenarios: Scenario[]): ScenarioResult[];
}

/** As-of, filter and compare entries a model keeps; the oldest is dropped first. */
const KEPT = 16;

/** `compute()` once per key, keeping the newest `KEPT` keys. */
function keyedMemo<V>(): (key: string, compute: () => V) => V {
  const kept = new Map<string, { value: V }>();
  return (key, compute) => {
    const hit = kept.get(key);
    if (hit) return hit.value;
    const value = compute();
    kept.set(key, { value });
    const oldest = kept.keys().next();
    if (kept.size > KEPT && !oldest.done) kept.delete(oldest.value);
    return value;
  };
}

/** `compute()` on the first call, its value after. */
function lazy<T>(compute: () => T): () => T {
  let box: { value: T } | null = null;
  return () => (box ??= { value: compute() }).value;
}

/** `run()`, or the engine's input error when the stored data breaks a rule. */
function reported<T>(run: () => T): T | InvalidPropertyData {
  try {
    return run();
  } catch (e) {
    if (e instanceof EngineInputError) return { invalid: e };
    throw e;
  }
}

/** `p` with every per-property collection cut to the rows of `p.properties`. */
function keptRows(p: Portfolio): Portfolio {
  const ids = new Set(p.properties.map((x) => x.id));
  const kept = <T extends { propertyId: string }>(rows: T[]) =>
    rows.filter((r) => ids.has(r.propertyId));
  return {
    ...p,
    mortgages: kept(p.mortgages),
    valuations: kept(p.valuations),
    leases: kept(p.leases),
    holdingCosts: kept(p.holdingCosts),
  };
}

/**
 * Each property's loan schedule, built the first time an id is asked for, so a filtered
 * view never builds (or throws on) a property it leaves out. The first call always runs
 * `propertySchedules`, so its assumptions check runs as before, even with no ids.
 */
function scheduleStore(portfolio: Portfolio, assumptions: Assumptions) {
  const built = new Map<string, PropertySchedule>();
  let checked = false;
  return (ids: string[]): Map<string, PropertySchedule> => {
    const missing = ids.filter((id) => !built.has(id));
    if (missing.length > 0 || !checked) {
      const fresh = propertySchedules(
        portfolio.mortgages,
        missing,
        assumptions,
      );
      for (const [id, s] of fresh) built.set(id, s);
      checked = true;
    }
    return new Map(
      ids.map((id) => [id, built.get(id) ?? EMPTY_PROPERTY_SCHEDULE]),
    );
  };
}

/** Each override field's content: an equal new overrides object is the same run. Keyed by
 *  every field of the type, so a new override field does not compile until it is listed;
 *  a per-field test pins that each field re-runs the compare. */
const OVERRIDE_FIELDS: Record<
  keyof ScenarioOverrides,
  (o: ScenarioOverrides) => unknown
> = {
  appreciationPa: (o) => o.appreciationPa?.toString(),
  rentIndexationPa: (o) => o.rentIndexationPa?.toString(),
  vacancyAllowance: (o) => o.vacancyAllowance?.toString(),
  postFixationResetRatePa: (o) => o.postFixationResetRatePa?.toString(),
  inflationPa: (o) => o.inflationPa?.toString(),
  inflationShock: (o) =>
    o.inflationShock && [
      o.inflationShock.deltaPa.toString(),
      o.inflationShock.durationYears,
    ],
  rateShock: (o) =>
    o.rateShock && [o.rateShock.deltaPa.toString(), o.rateShock.durationYears],
  valueShock: (o) =>
    o.valueShock && [o.valueShock.pct.toString(), o.valueShock.atYear],
};

const overridesKey = (o: ScenarioOverrides): string =>
  JSON.stringify(
    Object.values(OVERRIDE_FIELDS).map((field) => field(o) ?? null),
  );

type ScenarioRun = Omit<ScenarioResult, "id" | "name">;

/** One scenario's pass: its overrides folded onto the assumptions (`applyScenario`). */
function scenarioRun(
  portfolio: Portfolio,
  assumptions: Assumptions,
  overrides: ScenarioOverrides,
): ScenarioRun {
  const assn = applyScenario(assumptions, overrides);
  const { projection, kpis } = projectionAndKpis(portfolio, assn);
  return {
    projection,
    realProjection: realProjection(projection, cpiIndex(assn)),
    kpis,
  };
}

/** The compare: a scenario that breaks a rule is left out (ADR 0123); each run is kept
 *  by its overrides' content, and names are attached by id after the runs. */
function compareOf(
  portfolio: Portfolio,
  assumptions: Assumptions,
  runs: (key: string, compute: () => ScenarioRun) => ScenarioRun,
  scenarios: Scenario[],
): ScenarioResult[] {
  const nameOf = new Map(scenarios.map((s) => [s.id, s.name]));
  return timed("scenario-compare", () =>
    comparableScenarios(assumptions, scenarios).map((s) => ({
      id: s.id,
      ...runs(overridesKey(s.overrides), () =>
        scenarioRun(portfolio, assumptions, s.overrides),
      ),
      name: nameOf.get(s.id) ?? "",
    })),
  );
}

/** What a property's output reads that does not depend on the as-of date. */
interface PropertyFixed {
  property: Property;
  blocks: MortgageBlock[];
  built: PropertySchedule;
  projection: ProjectionYear[];
  acquisition: AcquisitionSummary;
}

type Schedules = ReturnType<typeof scheduleStore>;

function propertyFixed(
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules: Schedules,
  id: string,
): PropertyFixed | InvalidPropertyData | null {
  const property = portfolio.properties.find((p) => p.id === id);
  if (!property) return null;
  const blocks = portfolio.mortgages.filter((b) => b.propertyId === id);
  return reported(() => {
    const built = schedules([id]).get(id) ?? EMPTY_PROPERTY_SCHEDULE;
    return {
      property,
      blocks,
      built,
      projection: propertyProjection(property, portfolio, assumptions, built),
      acquisition: acquisitionSummary(property, portfolio),
    };
  });
}

function propertyAt(
  portfolio: Portfolio,
  assumptions: Assumptions,
  fixed: PropertyFixed,
  asOf: IsoDate,
): PropertyEngineOutput | InvalidPropertyData {
  const { property, blocks, built } = fixed;
  return reported(() => ({
    asOf,
    snapshot: propertySnapshot(
      property,
      portfolio,
      assumptions,
      asOf,
      built.rows,
    ),
    projection: fixed.projection,
    schedule: built.rows,
    eventOutcomes: built.eventOutcomes,
    financing: propertyLoanExposure(blocks, assumptions, built, asOf),
    acquisition: fixed.acquisition,
  }));
}

function outputsOf(
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules: Schedules,
  ids: readonly string[],
  asOf: IsoDate,
): EngineOutput {
  const filtered =
    ids.length > 0
      ? {
          ...portfolio,
          properties: portfolio.properties.filter((p) => ids.includes(p.id)),
        }
      : portfolio;
  const input = filtered === portfolio ? portfolio : keptRows(filtered);
  // One pass: schedules and projection are built once and shared.
  const out = timed("engine-recompute", () =>
    portfolioOutputs(
      input,
      assumptions,
      asOf,
      schedules(input.properties.map((p) => p.id)),
    ),
  );
  return {
    portfolio: filtered,
    assumptions,
    snapshot: out.snapshot,
    projection: out.projection,
    kpis: out.kpis,
    schedules: out.schedules,
    financing: out.financing,
  };
}

/** The sorted ids as one key: a new array with the same ids is the same view. */
const idsKey = (ids: readonly string[]): string =>
  ids.length > 0 ? JSON.stringify([...ids].sort()) : "";

function createEngineModel(
  portfolio: Portfolio,
  assumptions: Assumptions,
): EngineModel {
  const schedules = scheduleStore(portfolio, assumptions);
  const allIds = () => portfolio.properties.map((p) => p.id);
  const outputs = keyedMemo<EngineOutput>();
  const fixed = new Map<string, ReturnType<typeof propertyFixed>>();
  const atDate = keyedMemo<PropertyResult>();
  const runs = keyedMemo<ScenarioRun>();
  const compared = keyedMemo<ScenarioResult[]>();
  const byProperty = lazy(() =>
    propertyProjections(portfolio, assumptions, schedules(allIds())),
  );
  const projections = lazy(() => {
    const total = portfolioProjection(
      portfolio,
      assumptions,
      schedules(allIds()),
    );
    return { portfolio: total, byProperty: byProperty() };
  });
  const fixedOf = (id: string) => {
    if (!fixed.has(id))
      fixed.set(id, propertyFixed(portfolio, assumptions, schedules, id));
    return fixed.get(id) ?? null;
  };
  return {
    assumptions,
    outputs: (ids, asOf) =>
      outputs(`${idsKey(ids)}@${asOf.getTime()}`, () =>
        outputsOf(portfolio, assumptions, schedules, ids, asOf),
      ),
    projections,
    propertyProjections: byProperty,
    property: (id, asOf) => {
      const f = fixedOf(id);
      if (!f || "invalid" in f) return f;
      return atDate(`${JSON.stringify(id)}@${asOf.getTime()}`, () =>
        propertyAt(portfolio, assumptions, f, asOf),
      );
    },
    compare: (scenarios) =>
      compared(
        JSON.stringify(
          scenarios.map((s) => [s.id, s.name, overridesKey(s.overrides)]),
        ),
        () => compareOf(portfolio, assumptions, runs, scenarios),
      ),
  };
}

const models = new WeakMap<Portfolio, WeakMap<Assumptions, EngineModel>>();

/** The engine model of this portfolio and these assumptions, shared by every hook. */
export function getEngineModel(
  portfolio: Portfolio,
  assumptions: Assumptions,
): EngineModel {
  let byAssumptions = models.get(portfolio);
  if (!byAssumptions) {
    byAssumptions = new WeakMap();
    models.set(portfolio, byAssumptions);
  }
  let model = byAssumptions.get(assumptions);
  if (!model) {
    model = createEngineModel(portfolio, assumptions);
    byAssumptions.set(assumptions, model);
  }
  return model;
}
