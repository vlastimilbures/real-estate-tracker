// Committed debt on screen (ADR 0166): the debt figures show the drawn balance plus the
// development tranches not drawn yet; the tiles name that undrawn part.
import { ZERO, type Decimal } from "../../lib/money";

/** The part of a committed debt not drawn yet, or null when everything is drawn. */
export function undrawnPart(
  committed: Decimal,
  drawn: Decimal,
): Decimal | null {
  const undrawn = committed.minus(drawn);
  return undrawn.greaterThan(ZERO) ? undrawn : null;
}
