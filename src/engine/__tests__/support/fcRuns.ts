// fast-check run settings for the random property tests (#232). A file passes its own
// fixed seed and run count, so PR CI is reproducible; `FC_SEED` / `FC_RUNS` override
// them. The nightly run (nightly.yml) uses FC_RUNS=2000 and a date seed; replay a
// failure locally with the same two values.

/** A positive integer from the environment, else `fallback`. */
function fromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  // `NaN` runs would make fast-check run nothing and pass.
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  return n;
}

/** Milliseconds per run on a CI runner, with room for shrinking a failure. */
const MS_PER_RUN = 300;

/** `runs` for `fc.assert`, and an `it` timeout that grows with the run count (60 s at
 *  the defaults, 600 s at 2000 runs). */
export function fcRuns(seed: number, numRuns: number) {
  const runs = {
    seed: fromEnv("FC_SEED", seed),
    numRuns: fromEnv("FC_RUNS", numRuns),
  };
  return { runs, timeout: Math.max(60_000, runs.numRuns * MS_PER_RUN) };
}
