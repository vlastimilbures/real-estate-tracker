// Which loans a scenario rate shock reaches, for the Scenarios page (ADR 0100, #47).
// Pure: it mirrors the engine's block chain and `rateAt` on block dates only and does
// no rate maths. A tripwire test runs the engine with and without the shock so this
// cannot drift from `rateAt`.
import {
  blockEndDate,
  edate,
  EngineInputError,
  impliedMaturity,
  monthsBetween,
  selectBlock,
} from "../../engine";
import type {
  Assumptions,
  MortgageBlock,
  Portfolio,
  Scenario,
  ShockBand,
} from "../../engine";
import type { Dictionary } from "../../i18n";

/** Why a block's payments miss the shock window. */
type MissReason =
  | "fixedToMaturity"
  | "repaid"
  | "windowEnded"
  | "replacedBySuccessor"
  | "refixAfterHorizon";

interface BlockReach {
  blockId: string;
  hit: boolean;
  reason?: MissReason;
}

/** One loan = one property's block chain; `refixYears` are its hit fixation ends. */
export interface LoanReach {
  propertyId: string;
  hit: boolean;
  refixYears: number[];
  blocks: BlockReach[];
}

const ms = (d: Date) => d.getTime();

/** Per active property with a mortgage: whether `shock` reaches any of its payments. */
export function rateShockReach(
  portfolio: Portfolio,
  assumptions: Assumptions,
  shock: ShockBand,
): LoanReach[] {
  return portfolio.properties
    .filter((p) => p.active !== false)
    .flatMap((p) => {
      const chain = blockChain(
        portfolio.mortgages.filter((m) => m.propertyId === p.id),
        assumptions.baseDate,
      );
      if (chain.length === 0) return [];
      const reached = chain.map((b, i) => ({
        year: blockEndDate(b).getUTCFullYear(),
        ...blockReach(b, chain[i + 1], assumptions, shock),
      }));
      const refixYears = uniqueSorted(
        reached.filter((r) => r.hit).map((r) => r.year),
      );
      return [
        {
          propertyId: p.id,
          hit: refixYears.length > 0,
          refixYears,
          blocks: reached.map(({ blockId, hit, reason }) =>
            reason ? { blockId, hit, reason } : { blockId, hit },
          ),
        },
      ];
    });
}

/** "hits N of M loans (refix …)", "no effect", or undefined without loans. */
export function reachSummary(
  reach: LoanReach[],
  t: Dictionary,
): string | undefined {
  if (reach.length === 0) return undefined;
  const hit = reach.filter((l) => l.hit);
  if (hit.length === 0) return t.scenarios.reachNone;
  const years = uniqueSorted(hit.flatMap((l) => l.refixYears));
  return t.scenarios.reachHits(hit.length, reach.length, years.join(", "));
}

/** The reach note of a rate-shock scenario; undefined without a shock or loans, or
 *  when the data is invalid (the projection reports that itself). */
export function rateShockNote(
  scenario: Scenario,
  portfolio: Portfolio | null,
  assumptions: Assumptions | null,
  t: Dictionary,
): string | undefined {
  const shock = scenario.overrides.rateShock;
  if (!shock || !portfolio || !assumptions) return undefined;
  try {
    return reachSummary(rateShockReach(portfolio, assumptions, shock), t);
  } catch (e) {
    if (e instanceof EngineInputError) return undefined;
    throw e;
  }
}

/** The engine's chain: the block in force at baseDate (else the earliest upcoming),
 *  then each later start in order; a successor replaces its predecessor. */
function blockChain(blocks: MortgageBlock[], baseDate: Date): MortgageBlock[] {
  const chain: MortgageBlock[] = [];
  let block = selectBlock(blocks, baseDate);
  while (block) {
    chain.push(block);
    const after = ms(block.startDate);
    block = blocks
      .filter((b) => ms(b.startDate) > after)
      .sort((a, b) => ms(a.startDate) - ms(b.startDate))
      .at(0);
  }
  return chain;
}

/**
 * Payment k of a block is due EDATE(start, k) and sits in the baseDate grid row
 * k − offset. The shock reaches it when it is due after the fixation end and after
 * baseDate and on or before fixation end + N years, and the projection counts it: up to
 * maturity, in the horizon, before the successor takes over. Every bound but the first
 * two is an upper bound, so the first payment past both lower bounds decides.
 */
function blockReach(
  b: MortgageBlock,
  next: MortgageBlock | undefined,
  a: Assumptions,
  shock: ShockBand,
): BlockReach {
  const miss = (reason: MissReason) => ({ blockId: b.id, hit: false, reason });
  const fixEnd = blockEndDate(b);
  const maturity =
    impliedMaturity(b) ?? edate(b.startDate, (b.loanTermYears ?? 0) * 12);
  if (ms(fixEnd) >= ms(maturity)) return miss("fixedToMaturity");
  const offset = paymentOffset(b, a.baseDate);
  const k = Math.max(1, offset + 1, b.fixationYears * 12 + 1);
  const due = edate(b.startDate, k);
  const row = k - offset;
  if (ms(due) > ms(maturity)) return miss("repaid");
  if (ms(due) > ms(edate(fixEnd, shock.durationYears * 12)))
    return miss("windowEnded");
  if (next) {
    const d = drawMonth(next, a.baseDate);
    if (row > d || (row === d && ms(due) > ms(next.startDate)))
      return miss("replacedBySuccessor");
  }
  if (row > a.horizonYears * 12) return miss("refixAfterHorizon");
  return { blockId: b.id, hit: true };
}

/** Payments due by baseDate for a running loan; minus the draw month for a future one. */
function paymentOffset(b: MortgageBlock, baseDate: Date): number {
  if (ms(b.startDate) > ms(baseDate)) return -drawMonth(b, baseDate);
  let k = Math.max(0, monthsBetween(b.startDate, baseDate));
  while (ms(edate(b.startDate, k + 1)) <= ms(baseDate)) k++;
  while (k > 0 && ms(edate(b.startDate, k)) > ms(baseDate)) k--;
  return k;
}

/** The first grid month on or after a future block's start; 0 for a running one. */
function drawMonth(b: MortgageBlock, baseDate: Date): number {
  if (ms(b.startDate) <= ms(baseDate)) return 0;
  let m = Math.max(1, monthsBetween(baseDate, b.startDate));
  while (ms(edate(baseDate, m)) < ms(b.startDate)) m++;
  while (m > 1 && ms(edate(baseDate, m - 1)) >= ms(b.startDate)) m--;
  return m;
}

function uniqueSorted(years: number[]): number[] {
  return [...new Set(years)].sort((x, y) => x - y);
}
