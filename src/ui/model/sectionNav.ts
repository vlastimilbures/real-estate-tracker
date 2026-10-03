// Pure model for Property detail's section nav (ADR 0107): which sections the page shows,
// in page order, and which one is in view.

export type PropertySection =
  | "overview"
  | "records"
  | "financing"
  | "holding"
  | "projection"
  | "amortization";

/** The sections Property detail renders, in page order. Records, Financing and Holding
 *  costs are always there (they stay editable with invalid data); the rest need output. */
export function propertySections(has: {
  overview: boolean;
  projection: boolean;
  amortization: boolean;
}): PropertySection[] {
  return [
    ...(has.overview ? (["overview"] as const) : []),
    "records",
    "financing",
    "holding",
    ...(has.projection ? (["projection"] as const) : []),
    ...(has.amortization ? (["amortization"] as const) : []),
  ];
}

/** The element id a section's link points at. */
export const sectionId = (s: PropertySection) => `pd-${s}`;

/** The section in view: the first, in page order, inside the observed band. While none
 *  is in the band keep the previous one; at the bottom of the page the last one wins,
 *  since a short last section may never reach the band. */
export function pickCurrent<T>(
  order: readonly T[],
  inBand: ReadonlySet<T>,
  previous: T | null,
  atBottom: boolean,
): T | null {
  if (atBottom) return order.at(-1) ?? null;
  const first = order.find((s) => inBand.has(s));
  if (first !== undefined) return first;
  return previous ?? order[0] ?? null;
}
