import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  LineChart,
  GitCompareArrows,
  Upload,
  Settings,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useUiStore, type Route, type Theme } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { SegmentedToggle, ErrorBanner } from "./primitives";
import { BrandMark } from "./BrandMark";
import { BackupHint } from "./BackupHint";
import { SkipLink } from "./SkipLink";
import { ErrorBoundary } from "./ErrorBoundary";
import { fmtDate } from "../../lib/format";
import { APP_NAME, LANGUAGES, type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { describeWriteError } from "../model/writeError";
import { at } from "../../lib/arrays";

const NAV: {
  route: Route;
  navKey: keyof Dictionary["nav"];
  icon: LucideIcon;
}[] = [
  { route: "dashboard", navKey: "dashboard", icon: LayoutDashboard },
  { route: "properties", navKey: "properties", icon: Building2 },
  { route: "projections", navKey: "projections", icon: LineChart },
  { route: "scenarios", navKey: "scenarios", icon: GitCompareArrows },
  { route: "import", navKey: "importData", icon: Upload },
  { route: "settings", navKey: "settings", icon: Settings },
  { route: "guide", navKey: "guide", icon: BookOpen },
];

const THEME_OPTIONS: {
  value: Theme;
  labelKey: "themeLight" | "themeDark" | "themeSystem";
  icon: LucideIcon;
}[] = [
  { value: "light", labelKey: "themeLight", icon: Sun },
  { value: "dark", labelKey: "themeDark", icon: Moon },
  { value: "system", labelKey: "themeSystem", icon: Monitor },
];

/** Compact language selector (EN · CS · RU); mirrors the theme segmented control. */
function LanguageControl({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);

  if (collapsed) {
    const idx = LANGUAGES.findIndex((l) => l.value === language);
    const next = at(LANGUAGES, (idx + 1) % LANGUAGES.length);
    const current = at(LANGUAGES, idx >= 0 ? idx : 0);
    return (
      <button
        type="button"
        className="icon-btn"
        title={`${t.shell.language}: ${current.label}`}
        aria-label={`${t.shell.language}: ${current.label}. → ${next.label}`}
        onClick={() => setLanguage(next.value)}
      >
        <span style={{ fontSize: 11, fontWeight: 600 }}>{current.label}</span>
      </button>
    );
  }

  return (
    <div className="segmented" role="group" aria-label={t.shell.language}>
      {LANGUAGES.map((l) => (
        <button
          key={l.value}
          type="button"
          className={l.value === language ? "on" : ""}
          aria-pressed={l.value === language}
          onClick={() => setLanguage(l.value)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

/** Icon-only segmented control for appearance; collapses to a single cycling button. */
function ThemeControl({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  if (collapsed) {
    const idx = THEME_OPTIONS.findIndex((o) => o.value === theme);
    const current = at(THEME_OPTIONS, idx >= 0 ? idx : 2);
    const next = at(THEME_OPTIONS, (idx + 1) % THEME_OPTIONS.length);
    const Icon = current.icon;
    const curLabel = t.shell[current.labelKey];
    const nextLabel = t.shell[next.labelKey];
    return (
      <button
        type="button"
        className="icon-btn"
        title={t.shell.themeTitle(curLabel, nextLabel)}
        aria-label={t.shell.themeAria(curLabel, nextLabel)}
        onClick={() => setTheme(next.value)}
      >
        <Icon size={18} />
      </button>
    );
  }

  return (
    <div
      className="segmented icons"
      role="group"
      aria-label={t.shell.appearance}
    >
      {THEME_OPTIONS.map((o) => {
        const Icon = o.icon;
        const label = t.shell[o.labelKey];
        return (
          <button
            key={o.value}
            type="button"
            className={o.value === theme ? "on" : ""}
            aria-pressed={o.value === theme}
            title={label}
            aria-label={label}
            onClick={() => setTheme(o.value)}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}

// Sidebar brand (ADR 0105): the product name on two lines, "Real Estate" / "Tracker".
const BRAND_SPLIT = APP_NAME.lastIndexOf(" ");
const BRAND_HEAD = APP_NAME.slice(0, BRAND_SPLIT).replace(/ /g, "\u00a0");
const BRAND_TAIL = APP_NAME.slice(BRAND_SPLIT + 1);

export function AppShell({
  title,
  subtitle,
  actions,
  showLens = true,
  subnav,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
  showLens?: boolean | undefined;
  /** A full-width last row in the sticky topbar, e.g. a section nav (ADR 0107). */
  subnav?: ReactNode | undefined;
  children: ReactNode;
}) {
  const t = useT();
  const route = useUiStore((s) => s.route);
  const navigate = useUiStore((s) => s.navigate);
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const error = usePortfolioStore((s) => s.error);
  const clearError = usePortfolioStore((s) => s.clearError);
  const stale = usePortfolioStore((s) => s.stale);
  const reload = usePortfolioStore((s) => s.reload);
  const selectedPropertyId = useUiStore((s) => s.selectedPropertyId);

  // The app has no inner scroll container — the window itself scrolls. Without
  // this, navigating away from a page scrolled deep into a long table (e.g.
  // Projections) lands the next page at that same scroll offset instead of
  // its natural top. See docs/ux-review-2026-07-02.md P0 #2.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route, selectedPropertyId]);

  // The topbar's height as --topbar-h on the page, so an in-page jump lands a section
  // below the sticky topbar (scroll-margin-top), whatever rows the topbar wraps to.
  const topbarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = topbarRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() =>
      root.style.setProperty("--topbar-h", `${bar.offsetHeight}px`),
    );
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--topbar-h");
    };
  }, []);

  return (
    <div className={collapsed ? "shell collapsed" : "shell"}>
      <SkipLink />
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand">
            <BrandMark size={30} className="brand-logo" />
            <div className="brand-text">
              <span className="mark">
                {BRAND_HEAD}
                <br />
                <em>{BRAND_TAIL}</em>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn collapse-btn"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-label={
              collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar
            }
            title={collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>

        <nav className="nav">
          {NAV.map((n) => {
            const active =
              route === n.route ||
              (route === "property" && n.route === "properties");
            const Icon = n.icon;
            const label = t.nav[n.navKey];
            return (
              <button
                key={n.route}
                type="button"
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                aria-label={label}
                onClick={() => navigate(n.route)}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span className="nav-label">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <BackupHint collapsed={collapsed} />
          <LanguageControl collapsed={collapsed} />
          <ThemeControl collapsed={collapsed} />
          <div className="foot-meta">
            {assumptions && (
              <>{t.shell.baseDate(fmtDate(assumptions.baseDate))}</>
            )}
            <br />
            {t.shell.offline}
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar" ref={topbarRef}>
          <div>
            <div className="page-title">{title}</div>
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
        </header>
        <main className="page" id="main" tabIndex={-1}>
          {stale && (
            <ErrorBanner
              message={t.common.staleData}
              action={{ label: t.common.reload, onClick: () => void reload() }}
            />
          )}
          {error && (
            <ErrorBanner
              message={describeWriteError(t, error).message}
              onDismiss={clearError}
            />
          )}
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
