// The desktop app's perf sink (P9, D-66): each measure and milestone mark goes to the
// `perf_report` command, which prints one line to stderr with the time since launch
// (src-tauri/src/perf.rs). Fire-and-forget; nothing is stored or sent anywhere.
import { invoke } from "@tauri-apps/api/core";
import type { PerfSink } from "../lib/perf";

export const tauriPerfSink: PerfSink = (name, ms) => {
  invoke("perf_report", { name, ms }).catch(() => undefined);
};
