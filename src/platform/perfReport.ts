// The desktop app's perf sink (ADR 0066): each measure and milestone mark goes to the
// `perf_report` command, which prints one line to stderr with the time since launch
// (src-tauri/src/perf.rs). Fire-and-forget; nothing is stored or sent anywhere.
//
// ADR 0233: timing is off unless asked. `installPerf` runs once before the first render:
// a development build always measures; the release app measures only when the Rust side
// says it was started with RTRACKER_PERF=1 (`perf_enabled`). In a plain browser a
// development build keeps its marks without a sink; a production build records nothing.
import { call } from "./commands";
import { enablePerf, type PerfSink } from "../lib/perf";
import { isTauri } from "../lib/tauri";

export const tauriPerfSink: PerfSink = (name, ms) => {
  call("perf_report", { name, ms }).catch(() => undefined);
};

const TIMEOUT_MS = 1000;

/** Whether the app was started with RTRACKER_PERF=1; false when the question fails or
 *  has no answer within a second (it holds the first render, as fonts.ts does). */
async function askEnabled(): Promise<boolean> {
  const answer = call("perf_enabled").then(
    (on) => on === true,
    () => false,
  );
  const timeout = new Promise<false>((resolve) =>
    setTimeout(() => resolve(false), TIMEOUT_MS),
  );
  return Promise.race([answer, timeout]);
}

/** Turn timing on when this build or the app asks for it. Never rejects: if the app
 *  cannot be asked, or does not answer within a second, timing stays off (a late answer
 *  is ignored). */
export async function installPerf(
  dev: boolean = import.meta.env.DEV,
): Promise<void> {
  if (!isTauri()) {
    if (dev) enablePerf(null);
    return;
  }
  if (dev || (await askEnabled())) enablePerf(tauriPerfSink);
}
