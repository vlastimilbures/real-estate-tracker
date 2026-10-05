// fast-check run settings for the random property tests (#232). A file passes its own
// fixed seed and run count, so PR CI is reproducible; `FC_SEED` / `FC_RUNS` override
// them. The nightly run (nightly.yml) uses FC_RUNS=2000 and a date seed; replay a
// failure locally with the same two values.

/** Plain decimal digits, from the environment, else `fallback`. */
function fromEnv(name: string, fallback: number, pattern: RegExp): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  // `Number()` would take "1e3", " 7" or "0x10"; and `NaN` runs would run nothing and
  // pass.
  if (!pattern.test(raw))
    throw new Error(`${name} must match ${String(pattern)}, got "${raw}"`);
  return Number(raw);
}

/** Milliseconds per run on a CI runner (measured ~15 ms locally at 2000 runs). */
const MS_PER_RUN = 300;

/**
 * `runs` for `fc.assert`, and an `it` timeout that grows with the run count (60 s at
 * the defaults, 600 s at 2000 runs). Vitest cannot interrupt the synchronous
 * `fc.assert`: the timeout only fails a passing run that took too long. A failure
 * reports its counterexample however long shrinking takes; the nightly job's own
 * timeout bounds a hang.
 */
export function fcRuns(seed: number, numRuns: number) {
  const runs = {
    // fast-check takes a 32-bit seed.
    seed: fromEnv("FC_SEED", seed, /^\d{1,9}$/),
    numRuns: fromEnv("FC_RUNS", numRuns, /^[1-9]\d{0,6}$/),
  };
  return { runs, timeout: Math.max(60_000, runs.numRuns * MS_PER_RUN) };
}
