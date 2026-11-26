// Which loans a scenario rate shock reaches, for the Scenarios page (ADR 0100).
// The engine decides it (`blocksReachedByShock`, on the chain and fixation end `rateAt`
// uses); this module only shapes and words it.
import {
  blocksReachedByShock,
  EngineInputError,
  validateInputs,
} from "../../engine";
import type {
  Assumptions,
  BlockShockReach,
  Portfolio,
  Scenario,
  ShockBand,
} from "../../engine";
import type { Dictionary } from "../../i18n";

type BlockReach = Pick<BlockShockReach, "blockId" | "hit" | "reason">;

/** One loan = one property's block chain; `refixYears` are its hit fixation ends. */
export interface LoanReach {
  propertyId: string;
  hit: boolean;
  refixYears: number[];
  blocks: BlockReach[];
}

/** Per active property with a mortgage: whether `shock` reaches any of its payments. */
export function rateShockReach(
  portfolio: Portfolio,
  assumptions: Assumptions,
  shock: ShockBand,
): LoanReach[] {
  return blocksReachedByShock(portfolio, assumptions, shock).map((loan) => {
    const refixYears = uniqueSorted(
      loan.blocks
        .filter((b) => b.hit)
        .map((b) => b.fixedUntil.getUTCFullYear()),
    );
    return {
      propertyId: loan.propertyId,
      hit: refixYears.length > 0,
      refixYears,
      blocks: loan.blocks.map(({ blockId, hit, reason }) =>
        reason ? { blockId, hit, reason } : { blockId, hit },
      ),
    };
  });
}

/** "hits N of M loans (refix …)", "no effect", or undefined without loans. */
export function reachSummary(
  reach: LoanReach[],
  t: Pick<Dictionary, "scenarios">,
): string | undefined {
  if (reach.length === 0) return undefined;
  const hit = reach.filter((l) => l.hit);
  if (hit.length === 0) return t.scenarios.reachNone;
  const years = uniqueSorted(hit.flatMap((l) => l.refixYears));
  return t.scenarios.reachHits(hit.length, reach.length, years.join(", "));
}

/** The reach note of a rate-shock scenario; undefined without a shock or loans, or
 *  when the data is invalid (the projection reports that itself). Invalid data is
 *  checked first: the reach builds block schedules, which walk the payment grid from
 *  dates only validation vouches for (ADR 0247). */
export function rateShockNote(
  scenario: Scenario,
  portfolio: Portfolio | null,
  assumptions: Assumptions | null,
  t: Dictionary,
): string | undefined {
  const shock = scenario.overrides.rateShock;
  if (!shock || !portfolio || !assumptions) return undefined;
  if (validateInputs(portfolio, assumptions).length > 0) return undefined;
  try {
    return reachSummary(rateShockReach(portfolio, assumptions, shock), t);
  } catch (e) {
    if (e instanceof EngineInputError) return undefined;
    throw e;
  }
}

function uniqueSorted(years: number[]): number[] {
  return [...new Set(years)].sort((x, y) => x - y);
}
