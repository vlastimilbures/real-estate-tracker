// A call that may never return, run where it cannot hang the suite (ADR 0247, #543).
// Vitest cannot time out a synchronous endless loop, so `bounded` runs `fn(arg)` from a
// module in a child process and kills it after CHILD_MS. A test runs the call in-process
// only after the child returned.
import { spawnSync } from "node:child_process";

/** Far above a case's cold start (~0.2 s idle, ~1.7 s on an oversubscribed runner). */
const CHILD_MS = 10_000;

/** A test's own timeout, above the child's budget so a hang reports the child's error. */
export const BOUNDED_TIMEOUT = { timeout: CHILD_MS + 5_000 };

// The child loads the TypeScript as Node strips it; the hook adds the ".ts" (or
// "/index.ts") the source's imports leave out.
const CHILD = `
import { registerHooks } from "node:module";
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) {
      if (!spec.startsWith(".")) throw e;
      for (const ext of [".ts", "/index.ts"]) {
        try { return next(spec + ext, ctx); } catch {}
      }
      throw e;
    }
  },
});
const [url, fn, arg] = process.argv.slice(1);
const m = await import(url);
process.stdout.write(JSON.stringify({ value: m[fn](arg) }));
`;

/** `fn(arg)` exported by the module at `url`, run in a child process killed after
 *  CHILD_MS; its JSON result, or an Error saying it did not return or what it threw. */
export function bounded(url: string, fn: string, arg: string): unknown {
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "--no-warnings", "-e", CHILD, url, fn, arg],
    { encoding: "utf8", timeout: CHILD_MS },
  );
  if (r.error || r.signal)
    throw new Error(`${fn}(${arg}) did not return within ${CHILD_MS} ms`);
  if (r.status !== 0) throw new Error(r.stderr);
  return (JSON.parse(r.stdout) as { value: unknown }).value;
}
