// Scenario compare selection: which saved scenarios are ticked for the side-by-side
// compare. Pure helpers, kept out of the store so they test without zustand.

/** Tick `id` for compare while fewer than `max` are ticked; at the limit the selection
 *  stays as it is and `ticked` is false (ADR 0093). */
export function tickForCompare(
  ids: string[],
  id: string,
  max: number,
): { ids: string[]; ticked: boolean } {
  if (ids.includes(id)) return { ids, ticked: true };
  if (ids.length >= max) return { ids, ticked: false };
  return { ids: [...ids, id], ticked: true };
}
