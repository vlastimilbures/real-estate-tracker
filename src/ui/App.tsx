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
import { PageBoundary } from "./components/PageBoundary";
import { BootFailure } from "./components/BootFailure";
import { applyTheme, onSystemThemeChange } from "./theme";
import { useT } from "./hooks/useT";
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

// A page that fails to render keeps the sidebar (ADR 0146).
function CurrentPage() {
  return (
    <PageBoundary>
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    </PageBoundary>
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
  const init = usePortfolioStore((s) => s.init);
  const theme = useUiStore((s) => s.theme);
  const aboutOpen = useUiStore((s) => s.aboutOpen);
  const closeAbout = useUiStore((s) => s.closeAbout);
  const route = useUiStore((s) => s.route);

  useEffect(() => {
    void init();
  }, [init]);

  // Native menu items (UX-066): App ▸ About…, View ▸ page (⌘1–⌘5), File ▸ New Property…
  // (⌘N) and Settings… (⌘,, UX-074). Ignored while a dialog is open, so a menu key never
  // leaves a form behind or stacks About over it (ADR 0157). Guarded by the Tauri check
  // (mirrors src/data/tauriSql.ts) so browser/E2E never crash on the missing event bridge.
  useEffect(() => {
    if (!isTauri()) return;
    const dialogOpen = () =>
      document.querySelector('[aria-modal="true"]') !== null;
    const offs = [
      onMenuEvent("menu://about", () => {
        if (!dialogOpen()) useUiStore.getState().openAbout();
      }),
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
      <main className="loading-screen">
        <h1 className="eyebrow">{t.app.loadingEyebrow}</h1>
        <span>{t.app.loading}</span>
      </main>
    );
  }

  if (status === "error") return <BootFailure />;

  // Top-level backstop for a crash outside the page (a dialog, the leave guard); page
  // errors stop at PageBoundary. A route change, e.g. from the native menu, clears it
  // (ADR 0146).
  return (
    <ErrorBoundary resetKey={route}>
      <CurrentPage />
      {aboutOpen && <AboutModal onClose={closeAbout} />}
      <LeaveGuard />
    </ErrorBoundary>
  );
}
