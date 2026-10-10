// Debt on screen (ADR 0169): the debt figures show the drawn balance; the tiles name the
// development tranches not drawn yet beside it.
import { ZERO, type Decimal } from "../../lib/money";

/** The development tranches not drawn yet, or null when everything is drawn. */
export function undrawnPart(undrawn: Decimal): Decimal | null {
  return undrawn.greaterThan(ZERO) ? undrawn : null;
}
