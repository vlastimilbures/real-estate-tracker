// The desktop app's perf sink (P9, D-66): each measure and milestone mark goes to the
// `perf_report` command, which prints one line to stderr with the time since launch
// (src-tauri/src/perf.rs). Fire-and-forget; nothing is stored or sent anywhere.
//
// ADR 0233: timing is off unless asked. `installPerf` runs once before the first render:
// a development build always measures; the release app measures only when the Rust side
// says it was started with RTRACKER_PERF=1 (`perf_enabled`). In a plain browser a
// development build keeps its marks without a sink; a production build records nothing.
import { invoke } from "@tauri-apps/api/core";
import { enablePerf, type PerfSink } from "../lib/perf";
import { isTauri } from "../lib/tauri";

export const tauriPerfSink: PerfSink = (name, ms) => {
  invoke("perf_report", { name, ms }).catch(() => undefined);
};

/** Turn timing on when this build or the app asks for it. Never rejects: if the app
 *  cannot be asked, timing stays off. */
export async function installPerf(
  dev: boolean = import.meta.env.DEV,
): Promise<void> {
  if (!isTauri()) {
    if (dev) enablePerf(null);
    return;
  }
  const on = dev || (await invoke<boolean>("perf_enabled").catch(() => false));
  if (on) enablePerf(tauriPerfSink);
}
