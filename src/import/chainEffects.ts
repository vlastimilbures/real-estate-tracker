// What an added mortgage block does to its property's loan chain (ADR 0160): the notes
// the import plan adds to its items.
import type { ImportItem } from "./csvImport";
import {
  loanChainChanges,
  type Assumptions,
  type MortgageBlock,
} from "../engine";
import { isoDay } from "../lib/day";

/**
 * ADR 0160: what each added mortgage block does to its property's loan chain, as the
 * engine's schedule sees it (`loanChainChanges`). A block the schedule does not use
 * (it starts before the block in force) gets `noEffect`; a block that takes over from
 * a stored block lists the stored prepayments and maturity changes it stops.
 */
export function noteChainEffects(
  added: Map<string, ImportItem>,
  stored: MortgageBlock[],
  merged: MortgageBlock[],
  assumptions: Assumptions,
): void {
  const properties = new Set([...added.values()].map((i) => i.propertyId));
  for (const propertyId of properties) {
    const mine = (b: MortgageBlock) => b.propertyId === propertyId;
    const { stopped, unused } = loanChainChanges(
      stored.filter(mine),
      merged.filter(mine),
      assumptions,
    );
    for (const id of unused) {
      const item = added.get(id);
      if (item) item.noEffect = true;
    }
    for (const s of stopped) {
      const item = added.get(s.by);
      if (item)
        item.replaces = [
          ...(item.replaces ?? []),
          { kind: s.kind, date: isoDay(s.date) },
        ];
    }
  }
}
