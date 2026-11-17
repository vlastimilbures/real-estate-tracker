// Development-loan principal not drawn yet: committed debt (ADR 0166).
import { ZERO, type Decimal } from "../../lib/money";
import { firstGridMonthOnOrAfter, isAfter } from "../dates";
import { drawMonth, fundedThePurchase, isDevLoan } from "../amortization";
import { assertLoanInputs } from "../validate";
import type {
  Assumptions,
  MortgageBlock,
  MortgageDraw,
  Property,
} from "../types";
import { blockChain } from "./chain";

/**
 * Development-loan principal not drawn yet at the end of grid month `month` (0 =
 * baseDate), counted as committed debt (ADR 0166): the initial principal while the
 * loan has not drawn it, plus the tranches still ahead. It follows the schedule's
 * grid, so committed debt = balance + this never drifts from the schedule: an item
 * lands in the first grid month on/after its date, and one dated on/before baseDate
 * is opening debt (D-44). Before its own draw month a property's first loan counts: on a flat owned at
 * baseDate it pays the developer, and a future buy's acquisition loan is already netted
 * by the down payment (ADR 0119 §3; a development loan always is, ADR 0168). A future
 * buy's later first plain loan pays its initial principal to the owner as cash (ADR 0119
 * §5), and a successor replaces a debt owed
 * before, so both count only from their own draw month. A loan stops at its successor's draw
 * month, and a tranche dated after the successor's start is never drawn.
 */
export function undrawnPrincipal(
  property: Property,
  blocks: MortgageBlock[],
  assumptions: Assumptions,
  month: number,
): Decimal {
  const { baseDate } = assumptions;
  const futureBuy = isAfter(property.purchaseDate, baseDate);
  const chain = blockChain(blocks, baseDate);
  return chain.reduce<Decimal>((sum, block, i) => {
    if (!isDevLoan(block)) return sum;
    assertLoanInputs(block); // as the schedule it follows (ADR 0226)
    const next = chain[i + 1];
    const start = drawMonth(block, baseDate);
    const early = i === 0 && (!futureBuy || fundedThePurchase(property, block));
    if (month < start && !early) return sum;
    if (next && month >= drawMonth(next, baseDate)) return sum;
    const ahead = (d: MortgageDraw) =>
      isAfter(d.date, baseDate) &&
      firstGridMonthOnOrAfter(baseDate, d.date) > month &&
      !(next && isAfter(d.date, next.startDate));
    return (block.draws ?? [])
      .filter(ahead)
      .reduce<Decimal>(
        (s, d) => s.plus(d.amount),
        sum.plus(month < start ? block.initialPrincipal : ZERO),
      );
  }, ZERO);
}
