// Checked array access for the engine (noUncheckedIndexedAccess, DR-052). Every call
// site indexes an array it has sized itself (schedule rows, projection years, the CPI
// index), so the check never fires on valid input; if it does, it is an engine bug and
// fails loudly instead of flowing `undefined` into Decimal arithmetic.
export function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) {
    throw new Error(
      `Engine invariant broken: index ${i} out of range (length ${xs.length}).`,
    );
  }
  return x;
}
