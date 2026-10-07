// Keeps the app shell when a page fails to render (ADR 0146). Each page renders its own
// AppShell, and some call the engine first: when stored data breaks an engine rule, the
// error is thrown before that shell exists. This boundary then shows a shell of its own
// around the usual notice, so the sidebar, Settings and Import stay reachable. A route
// change clears it.
import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { BoundaryFallback, ErrorBoundary } from "./ErrorBoundary";
import { useUiStore, type Route } from "../../state/uiStore";
import { useT } from "../hooks/useT";
import type { Dictionary } from "../../i18n";

/** The page title the fallback shell shows; property detail falls under Properties. */
function pageTitle(t: Dictionary, route: Route): string {
  switch (route) {
    case "dashboard":
      return t.dashboard.title;
    case "properties":
    case "property":
      return t.properties.title;
    case "projections":
      return t.projections.title;
    case "scenarios":
      return t.scenarios.title;
    case "import":
      return t.importPage.title;
    case "settings":
      return t.settings.title;
    case "guide":
      return t.guide.title;
  }
}

export function PageBoundary({ children }: { children: ReactNode }) {
  const t = useT();
  const route = useUiStore((s) => s.route);
  return (
    <ErrorBoundary
      resetKey={route}
      fallback={(error, reset) => (
        <AppShell title={pageTitle(t, route)} showLens={false}>
          <BoundaryFallback error={error} reset={reset} />
        </AppShell>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
