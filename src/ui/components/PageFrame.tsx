// What every page renders inside the app's chrome: its sticky top bar (PageHeader)
// and its main region, with the kept banners above the page's content. A page returns it as
// its root in every variant (loading, empty, full), so a variant switch keeps it, and a page
// change mounts a new one with the page. The chrome around it, and the focus move to its
// main region after a page change, are AppLayout's (ADR 0263).
import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { SegmentedToggle } from "./Button";
import { ErrorBanner } from "./layout";
import { useFirstShow } from "../hooks/useFirstShow";
import { usePublishTopbarHeight } from "../hooks/useTopbar";
import { ErrorBoundary } from "./ErrorBoundary";
import { OutcomeRegions } from "./OutcomeRegions";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";

interface PageHeaderProps {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
  showLens?: boolean | undefined;
  /** A full-width last row in the sticky topbar, e.g. a section nav (ADR 0107). */
  subnav?: ReactNode | undefined;
  /** A breadcrumb link before the title, e.g. Property detail's way back to the list
   *  (ADR 0215 §1); the "›" after it is decorative. */
  crumb?: { label: string; onSelect: () => void } | undefined;
  /** Findings to review: an amber pill after the title (ADR 0218 §1). `label` is the
   *  full sentence, its accessible name and tooltip; the pill shows the number. */
  attention?:
    { count: number; label: string; onSelect: () => void } | undefined;
}

/** The title row: the breadcrumb, the title and the review pill. */
function PageTitle({
  title,
  crumb,
  attention,
}: Pick<PageHeaderProps, "title" | "crumb" | "attention">) {
  const heading = <h1 className="page-title">{title}</h1>;
  if (!crumb && !attention) return heading;
  return (
    <div className="page-title-row">
      {crumb && (
        <>
          <a
            className="crumb"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              crumb.onSelect();
            }}
          >
            {crumb.label}
          </a>
          <span className="crumb-sep" aria-hidden="true">
            ›
          </span>
        </>
      )}
      {heading}
      {attention && (
        <button
          type="button"
          className="chip warn title-pill"
          aria-label={attention.label}
          title={attention.label}
          onClick={attention.onSelect}
        >
          <AlertTriangle size={13} strokeWidth={2} aria-hidden="true" />
          {attention.count}
        </button>
      )}
    </div>
  );
}

/** The top bar's rows: the title and subtitle, the actions and the lens, the subnav. */
function PageHeader({
  subtitle,
  actions,
  showLens = true,
  subnav,
  ...title
}: PageHeaderProps) {
  const t = useT();
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  return (
    <>
      <div>
        <PageTitle {...title} />
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      <div className="row">
        {actions}
        {showLens && (
          <SegmentedToggle
            ariaLabel={t.shell.nominalOrReal}
            options={[
              { value: "nominal", label: t.common.nominal },
              { value: "real", label: t.common.real },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}
      </div>
      {subnav && <div className="topbar-subnav">{subnav}</div>}
    </>
  );
}

export function PageFrame({
  pageClass,
  children,
  ...header
}: PageHeaderProps & {
  /** A page-specific class on <main>, e.g. the Dashboard's denser spacing (ADR 0202). */
  pageClass?: string | undefined;
  children: ReactNode;
}) {
  const t = useT();
  const route = useUiStore((s) => s.route);
  const error = usePortfolioStore((s) => s.error);
  const clearError = usePortfolioStore((s) => s.clearError);
  const selectedPropertyId = useUiStore((s) => s.selectedPropertyId);
  const errorLive = useFirstShow(error);

  // The app has no inner scroll container — the window itself scrolls. Without
  // this, navigating away from a page scrolled deep into a long table (e.g.
  // Projections) lands the next page at that same scroll offset instead of
  // its natural top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route, selectedPropertyId]);

  // The top bar's height as --topbar-h (scroll-margin-top under the sticky bar).
  const topbarRef = useRef<HTMLElement>(null);
  usePublishTopbarHeight(topbarRef);

  return (
    <>
      <header className="topbar" ref={topbarRef}>
        <PageHeader {...header} />
      </header>
      <main
        className={pageClass ? `page ${pageClass}` : "page"}
        id="main"
        tabIndex={-1}
      >
        {error && (
          <ErrorBanner
            message={describeWriteError(t, error).message}
            onDismiss={clearError}
            live={errorLive}
          />
        )}
        <OutcomeRegions />
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </>
  );
}
