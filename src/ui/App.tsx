import { useEffect } from "react";
import "./styles/global.css";
import "./components/shell.css";
import "./components/panel.css";
import "./components/table.css";
import "./components/controls.css";
import "./components/forms.css";
import "./components/feedback.css";
import "./components/charts.css";
import "./components/layout.css";
// Here, not in InfoTip.tsx: the build puts InfoTip in the chunk the pages share, whose
// stylesheet loads before this one, so equal-specificity rules above would win (#494).
import "./styles/info-tip.css";
import { usePortfolioStore } from "../state/portfolioStore";
import { useUiStore } from "../state/uiStore";
import { ROUTES } from "./routes";
import { AboutModal } from "./components/AboutModal";
import { LeaveGuard } from "./components/LeaveGuard";
import { ToastRegion } from "./components/OutcomeRegions";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PageBoundary } from "./components/PageBoundary";
import { BootFailure } from "./components/BootFailure";
import { useT } from "./hooks/useT";
import { useNativeMenu } from "./hooks/useNativeMenu";
import { useThemeSync } from "./hooks/useThemeSync";

// The page inside the app's chrome; a page that fails to render keeps the sidebar
// (ADR 0146).
function CurrentPage() {
  return (
    <PageBoundary>
      <Page />
    </PageBoundary>
  );
}

/** The route's page, from the table (src/ui/routes.ts). */
function Page() {
  const Current = ROUTES[useUiStore((s) => s.route)].page;
  return <Current />;
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
