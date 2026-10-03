// The single recompute path. Memoized over (portfolio, assumptions): any edit produces
// new references in the store, which re-runs the pure engine here and pushes fresh output
// to every screen. Components consume this — they never call the engine inline.
import { useMemo } from "react";
import { usePortfolioStore } from "./portfolioStore";
import { todayUtc } from "../lib/today";
import { timed } from "../lib/perf";
import {
  portfolioOutputs,
  projectionAndKpis,
  propertySnapshot,
  portfolioProjection,
  propertyProjection,
  schedulesByProperty,
  propertySchedules,
  propertyLoanExposure,
  applyScenario,
  cpiIndex,
  EngineInputError,
  realProjection,
  utc,
} from "../engine";
import type {
  Scenario,
  Portfolio,
  Assumptions,
  PortfolioSnapshot,
  PortfolioKPIs,
  ProjectionYear,
  AmortizationRow,
  FinancingExposure,
  IsoDate,
  LoanEventOutcome,
  LoanExposure,
  PropertySnapshot,
} from "../engine";

/**
 * The as-of date the engine sees: the picked date or today, never before baseDate
 * (D-19 default max(today, baseDate); the engine rejects an earlier one). Bounding the
 * picker itself is P7. UI-boundary dates are UTC midnight by construction (todayUtc,
 * DateInput, AsOfPicker); `utc` rebuilds the same day as a branded IsoDate (D-25). The
 * memos below key on getTime(), so the fresh object does not trigger a recompute.
 */
function engineAsOf(asOf: Date | null | undefined, baseDate?: Date): IsoDate {
  const picked = asOf ?? todayUtc();
  const day = baseDate && picked < baseDate ? baseDate : picked;
  return utc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
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

/**
 * Portfolio-wide engine output, or null until the store has loaded.
 *
 * Pass `propertyIds` to compute over a subset (e.g. the Dashboard filter). The
 * engine sees only the kept properties and their rows, so the other properties'
 * rows are not orphans to it (D-37); the returned `portfolio` keeps the other
 * arrays whole. Empty/undefined = whole portfolio (default for all callers).
 */
export function useEngine(
  propertyIds?: string[] | null,
  asOf?: Date | null,
): EngineOutput | null {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  // Stable string dep: a new array ref with the same ids won't recompute, a
  // content change will. Sorted so order doesn't matter.
  const key =
    propertyIds && propertyIds.length ? [...propertyIds].sort().join(",") : "";
  // Resolve "today" at the UI boundary (engine stays pure). Day-bucket the value
  // so the memo doesn't recompute on every render from a fresh Date.
  const asOfDate = engineAsOf(asOf, assumptions?.baseDate);
  const asOfKey = asOfDate.getTime();
  return useMemo(() => {
    if (!portfolio || !assumptions) return null;
    const filtered =
      propertyIds && propertyIds.length
        ? {
            ...portfolio,
            properties: portfolio.properties.filter((p) =>
              propertyIds.includes(p.id),
            ),
          }
        : portfolio;
    const input = filtered === portfolio ? portfolio : keptRows(filtered);
    // One pass: schedules and projection are built once and shared (DR-042).
    const out = timed("engine-recompute", () =>
      portfolioOutputs(input, assumptions, asOfDate),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, assumptions, key, asOfKey]);
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
 * Returns one result per input scenario, in order, or null until the store has loaded.
 */
export function useScenarioComparison(
  scenarios: Scenario[],
): ScenarioResult[] | null {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  // Stable dep: re-run only when a selected scenario's id/overrides/shock change.
  const key = scenarios
    .map((s) => `${s.id}:${JSON.stringify(serializeForKey(s))}`)
    .join("|");
  const computed = useMemo(() => {
    if (!portfolio || !assumptions) return null;
    return timed("scenario-compare", () =>
      scenarios.map((s) => {
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
  // re-running the engine (DR-055).
  const names = scenarios.map((s) => s.name).join("\u0000");
  return useMemo(
    () =>
      computed &&
      computed.map((r, i) => ({ ...r, name: scenarios[i]?.name ?? "" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [computed, names],
  );
}

/** Decimals → strings so a scenario's content can key the comparison memo. */
function serializeForKey(s: Scenario) {
  const o = s.overrides;
  return {
    appreciationPa: o.appreciationPa?.toString(),
    rentIndexationPa: o.rentIndexationPa?.toString(),
    vacancyAllowance: o.vacancyAllowance?.toString(),
    postFixationResetRatePa: o.postFixationResetRatePa?.toString(),
    inflationPa: o.inflationPa?.toString(),
    inflationShock: o.inflationShock
      ? `${o.inflationShock.deltaPa}/${o.inflationShock.durationYears}`
      : undefined,
    rateShock: o.rateShock
      ? `${o.rateShock.deltaPa}/${o.rateShock.durationYears}`
      : undefined,
    valueShock: o.valueShock
      ? `${o.valueShock.pct}@${o.valueShock.atYear}`
      : undefined,
  };
}

export interface NamedProjection {
  id: string;
  name: string;
  projection: ProjectionYear[];
}

/** Portfolio + every property's year-by-year projection (for the Projections grid). */
export function useAllProjections(): {
  portfolio: ProjectionYear[];
  perProperty: NamedProjection[];
} | null {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  return useMemo(() => {
    if (!portfolio || !assumptions) return null;
    const schedules = schedulesByProperty(
      portfolio.mortgages,
      portfolio.properties.map((p) => p.id),
      assumptions,
    );
    return {
      portfolio: portfolioProjection(portfolio, assumptions, schedules),
      perProperty: portfolio.properties
        .filter((p) => p.active !== false)
        .map((p) => ({
          id: p.id,
          name: p.name,
          projection: propertyProjection(
            p,
            portfolio,
            assumptions,
            schedules.get(p.id) ?? [],
          ),
        })),
    };
  }, [portfolio, assumptions]);
}

export interface PropertyEngineOutput {
  /** The as-of date the snapshot was evaluated at (picked or today, ≥ baseDate). */
  asOf: IsoDate;
  snapshot: PropertySnapshot;
  projection: ProjectionYear[];
  schedule: AmortizationRow[];
  /** What the loan's prepayments and recasts did (ADR 0109, shown as warnings: ADR 0116). */
  eventOutcomes: LoanEventOutcome[];
  /** Modelled payoff and interest saved (ADR 0116); null without a loan. */
  loan: LoanExposure | null;
}

/** Stored data that breaks an engine rule, reported instead of thrown (DR-146). */
export interface InvalidPropertyData {
  invalid: EngineInputError;
}

/**
 * Per-property engine output for the detail screen, or the engine's input error when the
 * stored data breaks a rule, so the page can still show the records to fix (DR-146).
 */
export function usePropertyEngineResult(
  propertyId: string | null,
  asOf?: Date | null,
): PropertyEngineOutput | InvalidPropertyData | null {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const asOfDate = engineAsOf(asOf, assumptions?.baseDate);
  const asOfKey = asOfDate.getTime();
  return useMemo(() => {
    if (!portfolio || !assumptions || !propertyId) return null;
    const property = portfolio.properties.find((p) => p.id === propertyId);
    if (!property) return null;
    try {
      const built = propertySchedules(
        portfolio.mortgages,
        [propertyId],
        assumptions,
      ).get(propertyId);
      const schedule = built?.rows ?? [];
      return {
        asOf: asOfDate,
        snapshot: propertySnapshot(
          property,
          portfolio,
          assumptions,
          asOfDate,
          schedule,
        ),
        projection: propertyProjection(
          property,
          portfolio,
          assumptions,
          schedule,
        ),
        schedule,
        eventOutcomes: built?.eventOutcomes ?? [],
        loan: propertyLoanExposure(
          portfolio.mortgages.filter((b) => b.propertyId === propertyId),
          assumptions,
          schedule,
          asOfDate,
        ),
      };
    } catch (e) {
      if (e instanceof EngineInputError) return { invalid: e };
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, assumptions, propertyId, asOfKey]);
}

/** Per-property engine output for the detail screen (throws on invalid stored data). */
export function usePropertyEngine(
  propertyId: string | null,
  asOf?: Date | null,
): PropertyEngineOutput | null {
  const r = usePropertyEngineResult(propertyId, asOf);
  if (r && "invalid" in r) throw r.invalid;
  return r;
}
