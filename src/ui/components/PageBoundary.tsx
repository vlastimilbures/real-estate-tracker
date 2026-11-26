// The current page inside the app's chrome, and the chrome kept when the page fails to
// render (ADR 0146). Some pages call the engine before they render their frame: when stored
// data breaks an engine rule, the error is thrown before that frame exists. This boundary
// then shows a frame of its own around the usual notice, so the sidebar, Settings and
// Import stay reachable. A route change clears it.
//
// The chrome (AppLayout) is rendered once, with no route key, and the boundary sits inside
// it: a page change, a page's code loading and the fallback coming or going keep the
// sidebar (ADR 0263).
import type { ReactNode } from "react";
import { AppLayout } from "./AppLayout";
import { PageFrame } from "./PageFrame";
import { BoundaryFallback, ErrorBoundary } from "./ErrorBoundary";
import { useUiStore } from "../../state/uiStore";
import { useT } from "../hooks/useT";
import { ROUTES } from "../routes";

export function PageBoundary({ children }: { children: ReactNode }) {
  const t = useT();
  const route = useUiStore((s) => s.route);
  return (
    <AppLayout>
      <ErrorBoundary
        resetKey={route}
        fallback={(error, reset) => (
          <PageFrame title={ROUTES[route].title(t)} showLens={false}>
            <BoundaryFallback error={error} reset={reset} />
          </PageFrame>
        )}
      >
        {children}
      </ErrorBoundary>
    </AppLayout>
  );
}
