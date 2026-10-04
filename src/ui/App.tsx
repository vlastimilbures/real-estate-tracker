import { lazy, Suspense, useEffect } from "react";
import "./styles/global.css";
import "./components/components.css";
import { usePortfolioStore } from "../state/portfolioStore";
import { useUiStore } from "../state/uiStore";
import { Dashboard } from "./pages/Dashboard";
import { Properties } from "./pages/Properties";
import { AboutModal } from "./components/AboutModal";
import { LeaveGuard } from "./components/LeaveGuard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Button } from "./components/primitives";
import { applyTheme, onSystemThemeChange } from "./theme";
import { useT } from "./hooks/useT";
import { describeWriteError } from "./model/writeError";
import { menuLabels, menuRoute } from "./model/menu";
import { isTauri } from "../lib/tauri";
import { onMenuEvent, setMenuLabels } from "../state/platform";

// Pages away from the start screen load on first visit (P9): their code, and the
// libraries only they use, stay out of the startup bundle. The fallback is empty; the
// chunk is a local file, so the gap is a few milliseconds (D-66, DR-009).
const PropertyDetail = lazy(() =>
  import("./pages/PropertyDetail").then((m) => ({ default: m.PropertyDetail })),
);
const Projections = lazy(() =>
  import("./pages/Projections").then((m) => ({ default: m.Projections })),
);
const Scenarios = lazy(() =>
  import("./pages/Scenarios").then((m) => ({ default: m.Scenarios })),
);
const Import = lazy(() =>
  import("./pages/Import").then((m) => ({ default: m.Import })),
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.SettingsPage })),
);
const Guide = lazy(() =>
  import("./pages/Guide").then((m) => ({ default: m.Guide })),
);

function CurrentPage() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}

function Page() {
  const route = useUiStore((s) => s.route);
  switch (route) {
    case "dashboard":
      return <Dashboard />;
    case "properties":
      return <Properties />;
    case "property":
      return <PropertyDetail />;
    case "projections":
      return <Projections />;
    case "scenarios":
      return <Scenarios />;
    case "import":
      return <Import />;
    case "settings":
      return <SettingsPage />;
    case "guide":
      return <Guide />;
    default:
      return <Dashboard />;
  }
}

export function App() {
  const t = useT();
  const status = usePortfolioStore((s) => s.status);
  const error = usePortfolioStore((s) => s.error);
  const startupError = usePortfolioStore((s) => s.startupError);
  const init = usePortfolioStore((s) => s.init);
  const theme = useUiStore((s) => s.theme);
  const aboutOpen = useUiStore((s) => s.aboutOpen);
  const closeAbout = useUiStore((s) => s.closeAbout);

  useEffect(() => {
    void init();
  }, [init]);

  // Bridge the native macOS menu (App → About…) to the About modal. Guard with the
  // Tauri-environment check (mirrors src/data/tauriSql.ts) so browser/E2E never crash on
  // the unavailable event bridge.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = onMenuEvent("menu://about", () => {
      useUiStore.getState().openAbout();
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Native menu shortcuts (UX-066): View ▸ page (⌘1–⌘5), File ▸ New Property… (⌘N) and
  // Settings… (⌘,, UX-074). Ignored while a dialog is open, so a menu key never leaves a
  // form behind.
  useEffect(() => {
    if (!isTauri()) return;
    const dialogOpen = () =>
      document.querySelector('[aria-modal="true"]') !== null;
    const offs = [
      onMenuEvent("menu://navigate", (e) => {
        const route = menuRoute(e.payload);
        if (route && !dialogOpen()) useUiStore.getState().navigate(route);
      }),
      onMenuEvent("menu://new-property", () => {
        if (!dialogOpen()) useUiStore.getState().requestNewProperty();
      }),
      onMenuEvent("menu://settings", () => {
        if (!dialogOpen()) useUiStore.getState().openSettings();
      }),
    ];
    return () => {
      for (const off of offs) void off.then((f) => f());
    };
  }, []);

  // The native menu items the app adds follow the UI language (UX-076): sent at start and
  // on every language change (`t` is one dictionary object per language).
  useEffect(() => {
    if (isTauri()) setMenuLabels(menuLabels(t));
  }, [t]);

  // Keep <html data-theme> in sync with the preference, and follow the OS while the
  // preference is "system".
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    return onSystemThemeChange(() => applyTheme("system"));
  }, [theme]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="loading-screen">
        <span className="eyebrow">{t.app.loadingEyebrow}</span>
        <span>{t.app.loading}</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="error-screen" role="alert">
        <span className="eyebrow">{t.app.dbErrorEyebrow}</span>
        {startupError ? (
          <>
            <p>{t.dataErrors[startupError.code]}</p>
            {startupError.details.length > 0 && (
              <div className="error-screen-details">
                <span>{t.dataErrors.detailsHeading}</span>
                <ul>
                  {startupError.details.map((d) => (
                    <li key={d}>
                      <code>{d}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          error && <code>{describeWriteError(t, error).message}</code>
        )}
        {/* Not a dead end (DR-086): what to do next, and a retry of the startup. */}
        <p>{t.app.bootRetryHint}</p>
        <small>{t.dataErrors.logHint}</small>
        <div>
          <Button variant="primary" onClick={() => void init()}>
            {t.app.tryAgain}
          </Button>
        </div>
      </div>
    );
  }

  // Top-level backstop: catches render crashes that happen before a page mounts its
  // own AppShell (whose boundary keeps the nav usable for in-content errors).
  return (
    <ErrorBoundary>
      <CurrentPage />
      {aboutOpen && <AboutModal onClose={closeAbout} />}
      <LeaveGuard />
    </ErrorBoundary>
  );
}
