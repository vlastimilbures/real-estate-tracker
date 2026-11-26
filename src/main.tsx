import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import { loadAppFonts } from "./ui/fonts";
import { applyTheme } from "./ui/theme";
import { readPersistedTheme } from "./state/themePreference";
import { loadStartupDictionary } from "./state/uiStore";
import { installPerf } from "./platform/perfReport";

// Apply the saved appearance before first paint to avoid a light-flash on launch.
applyTheme(readPersistedTheme());

// Render once the active language's dictionary (ADR 0066) and the bundled fonts
// (ADR 0192) have loaded, so the first frame is translated and charts measure the final
// font. Both are local files: this adds a few milliseconds. `installPerf` decides in the
// same wait whether startup and interaction timings go to the app's stderr (ADR 0066):
// always in a development build, in the release app only when started with
// RTRACKER_PERF=1 (ADR 0233). Deciding before the first render means no early mark is
// lost or leaked.
void Promise.all([
  loadStartupDictionary(),
  loadAppFonts(document.fonts),
  installPerf(),
])
  .catch((error: unknown) => console.error(error))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
