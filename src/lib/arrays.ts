// Checked array access outside the engine (noUncheckedIndexedAccess, DR-052, ADR 0074),
// for indexes the caller has already bounded (a found index, a modulo, a range check). It
// fails loudly instead of flowing `undefined` on. The engine keeps its own copy in
// src/engine/arrays.ts (the engine may import only lib/money).
export function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) {
    throw new Error(
      `Invariant broken: index ${i} out of range (length ${xs.length}).`,
    );
  }
  return x;
}
