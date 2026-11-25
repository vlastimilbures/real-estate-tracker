// The current page inside the app's chrome, and the chrome kept when the page fails to
// render (ADR 0146). Some pages call the engine before they render their frame: when stored
// data breaks an engine rule, the error is thrown before that frame exists. This boundary
// then shows the chrome with a frame of its own around the usual notice, so the sidebar,
// Settings and Import stay reachable. A route change clears it.
//
// The chrome (AppLayout) is built in one place, `inLayout`, keyed by the route: a page change
// mounts it again, and so does the fallback coming or going, which sits at its own place in
// the tree. The lazy pages' Suspense is around it, so while a page's code loads the chrome
// is hidden with the outgoing page (#483).
import { Suspense, type ReactNode } from "react";
import { AppLayout } from "./AppLayout";
import { PageFrame } from "./PageFrame";
import { BoundaryFallback, ErrorBoundary } from "./ErrorBoundary";
import { useUiStore, type Route } from "../../state/uiStore";
import { useT } from "../hooks/useT";
import type { Dictionary } from "../../i18n";

/** The page title the fallback shows; property detail falls under Properties. */
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
  const inLayout = (page: ReactNode) => (
    <AppLayout key={route}>{page}</AppLayout>
  );
  return (
    <ErrorBoundary
      resetKey={route}
      fallback={(error, reset) =>
        inLayout(
          <PageFrame title={pageTitle(t, route)} showLens={false}>
            <BoundaryFallback error={error} reset={reset} />
          </PageFrame>,
        )
      }
    >
      <Suspense fallback={null}>{inLayout(children)}</Suspense>
    </ErrorBoundary>
  );
}
