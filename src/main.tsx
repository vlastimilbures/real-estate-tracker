import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import { applyTheme } from "./ui/theme";
import { readPersistedTheme } from "./state/themePreference";
import { setPerfSink } from "./lib/perf";
import { tauriPerfSink } from "./platform/perfReport";
import { isTauri } from "./lib/tauri";

// Startup and interaction timings to the app's stderr (P9); none in a browser.
if (isTauri()) setPerfSink(tauriPerfSink);

// Apply the saved appearance before first paint to avoid a light-flash on launch.
applyTheme(readPersistedTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
