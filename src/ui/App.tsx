import { lazy, Suspense, useEffect } from "react";
import "./styles/global.css";
import "./components/shell.css";
import "./components/panel.css";
import "./components/table.css";
import "./components/controls.css";
import "./components/forms.css";
import "./components/feedback.css";
import "./components/charts.css";
import "./components/layout.css";
// Here, not in InfoTip.tsx: the build puts InfoTip in the shared AppShell chunk, whose
// stylesheet loads before this one, so equal-specificity rules above would win (#494).
import "./styles/info-tip.css";
import { usePortfolioStore } from "../state/portfolioStore";
import { useUiStore } from "../state/uiStore";
import { Dashboard } from "./pages/Dashboard";
import { Properties } from "./pages/Properties";
import { AboutModal } from "./components/AboutModal";
import { LeaveGuard } from "./components/LeaveGuard";
import { ToastRegion } from "./components/OutcomeRegions";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PageBoundary } from "./components/PageBoundary";
import { BootFailure } from "./components/BootFailure";
import { useT } from "./hooks/useT";
import { useNativeMenu } from "./hooks/useNativeMenu";
import { useThemeSync } from "./hooks/useThemeSync";

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
  const status = usePortfolioStore((s) => s.status.kind);
  const init = usePortfolioStore((s) => s.init);
  const aboutOpen = useUiStore((s) => s.aboutOpen);
  const closeAbout = useUiStore((s) => s.closeAbout);
  const route = useUiStore((s) => s.route);

  useEffect(() => {
    void init();
  }, [init]);

  useNativeMenu();
  useThemeSync();

  if (status === "loading" || status === "idle") {
    return (
      <main className="loading-screen">
        <h1 className="eyebrow">{t.app.loadingEyebrow}</h1>
        <span>{t.app.loading}</span>
      </main>
    );
  }

  if (status === "startupFailed" || status === "readBackFailed")
    return <BootFailure />;

  // Top-level backstop for a crash outside the page (a dialog, the leave guard); page
  // errors stop at PageBoundary. A route change, e.g. from the native menu, clears it
  // (ADR 0146).
  return (
    <ErrorBoundary resetKey={route}>
      <CurrentPage />
      {/* Beside the page, so a toast outlives a page change (ADR 0189). */}
      <ToastRegion />
      {aboutOpen && <AboutModal onClose={closeAbout} />}
      <LeaveGuard />
    </ErrorBoundary>
  );
}
