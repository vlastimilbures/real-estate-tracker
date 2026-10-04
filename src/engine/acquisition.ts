// How a purchase was funded (ADR 0119): the owner's funding record, the acquisition
// loan derived from the mortgage blocks, the sources-and-uses check, and the down
// payment a property bought after baseDate is charged in its turn-on year.
import { ZERO, type Decimal } from "../lib/money";
import { addDays, firstAfter, isAfter, isOnOrBefore } from "./dates";
import { forProperty } from "./metrics";
import type { Assumptions, MortgageBlock, Portfolio, Property } from "./types";

/** A block starting up to this many days after the purchase funded it (ADR 0119 §3). */
const ACQUISITION_LOAN_WINDOW_DAYS = 90;

/** What funded a purchase and what it paid for. Null = unknown (never 0). */
export interface AcquisitionSummary {
  price: Decimal;
  /** The acquisition loan's whole scheduled principal; null when there is none. */
  loan: Decimal | null;
  ownCash: Decimal | null;
  transactionCosts: Decimal | null;
  initialWorks: Decimal | null;
  /** Price + the recorded costs and works. */
  uses: Decimal;
  /** Own cash + the acquisition loan (0 without one); null while own cash is unknown. */
  sources: Decimal | null;
  /** Uses − sources: > 0 the recorded sources fall short, < 0 they exceed the uses. */
  gap: Decimal | null;
  /** The down payment of a future buy: the own cash, else derived (ADR 0119 §5). */
  outflow: Decimal;
}

/**
 * The block that funded the purchase (ADR 0119 §3): the property's earliest block, when
 * it starts no later than 90 days after the purchase date. Any earlier start counts (an
 * off-plan loan drawn before handover). A later block is a successor, never this one.
 * `blocks` must be the property's own.
 */
function acquisitionLoanBlock(
  property: Property,
  blocks: MortgageBlock[],
): MortgageBlock | undefined {
  let earliest: MortgageBlock | undefined;
  for (const b of blocks) {
    if (!earliest || isAfter(earliest.startDate, b.startDate)) earliest = b;
  }
  const latest = addDays(property.purchaseDate, ACQUISITION_LOAN_WINDOW_DAYS);
  return earliest && isOnOrBefore(earliest.startDate, latest)
    ? earliest
    : undefined;
}

/** A loan's initial principal plus its tranches dated on or before the start of the
 *  block that replaces it: the schedule's cut (D-47), so a tranche it never draws does
 *  not count (ADR 0119 §3). */
function principalUntilReplaced(
  block: MortgageBlock,
  blocks: MortgageBlock[],
): Decimal {
  const next = firstAfter(blocks, block.startDate, (b) => b.startDate);
  return (block.draws ?? [])
    .filter((d) => !next || isOnOrBefore(d.date, next.startDate))
    .reduce<Decimal>((s, d) => s.plus(d.amount), block.initialPrincipal);
}

/** The recorded parts of a funding record, null where unknown. */
function recorded(property: Property) {
  const f = property.funding ?? {};
  return {
    ownCash: f.ownCash ?? null,
    transactionCosts: f.transactionCosts ?? null,
    initialWorks: f.initialWorks ?? null,
  };
}

/** ADR 0119 §5/§6: price − loan + costs + works, where costs are the entered ones,
 *  else the engine-only rate on the price, else 0, and works the entered ones, else 0. */
function derivedDownPayment(
  price: Decimal,
  loan: Decimal,
  parts: ReturnType<typeof recorded>,
  costPct: Decimal,
): Decimal {
  const costs = parts.transactionCosts ?? price.times(costPct);
  return price
    .minus(loan)
    .plus(costs)
    .plus(parts.initialWorks ?? ZERO);
}

/** ADR 0119 §4: uses = price + recorded costs and works; sources = own cash + loan;
 *  sources and gap only while own cash is known. */
function sourcesAndUses(
  price: Decimal,
  loan: Decimal,
  parts: ReturnType<typeof recorded>,
) {
  const uses = price
    .plus(parts.transactionCosts ?? ZERO)
    .plus(parts.initialWorks ?? ZERO);
  const sources = parts.ownCash?.plus(loan) ?? null;
  return {
    uses,
    sources,
    gap: sources === null ? null : uses.minus(sources),
  };
}

export function acquisitionSummary(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
): AcquisitionSummary {
  const price = property.purchasePrice;
  const blocks = forProperty(portfolio.mortgages, property.id);
  const block = acquisitionLoanBlock(property, blocks);
  const loan = block ? principalUntilReplaced(block, blocks) : null;
  const loanOrZero = loan ?? ZERO;
  const parts = recorded(property);
  return {
    price,
    loan,
    ...parts,
    ...sourcesAndUses(price, loanOrZero, parts),
    outflow:
      parts.ownCash ??
      derivedDownPayment(
        price,
        loanOrZero,
        parts,
        assumptions.acquisitionCostPct ?? ZERO,
      ),
  };
}
