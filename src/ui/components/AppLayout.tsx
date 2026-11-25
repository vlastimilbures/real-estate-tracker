// The app's chrome around the page (#483): the skip link, the sidebar and the column the
// page's own frame (PageFrame: top bar and main region) fills. PageBoundary renders it once
// per page, keyed by the route, so a page change mounts it again (ADR 0146).
import type { ReactNode } from "react";
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
import { BrandMark } from "./BrandMark";
import { BackupHint } from "./BackupHint";
import { SkipLink } from "./SkipLink";
import { fmtDate } from "../../lib/format";
import { APP_NAME, LANGUAGES, type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { at } from "../../lib/arrays";

interface NavItem {
  route: Route;
  navKey: keyof Dictionary["nav"];
  icon: LucideIcon;
}

/** The left bar's two groups (ADR 0219): the pages on top, the tools above the footer. */
const NAV_PAGES: NavItem[] = [
  { route: "dashboard", navKey: "dashboard", icon: LayoutDashboard },
  { route: "properties", navKey: "properties", icon: Building2 },
  { route: "projections", navKey: "projections", icon: LineChart },
  { route: "scenarios", navKey: "scenarios", icon: GitCompareArrows },
];
const NAV_TOOLS: NavItem[] = [
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
        <span className="icon-btn-label">{current.label}</span>
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

/** The left bar: the brand, the page buttons and the footer controls. */
function Sidebar({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const route = useUiStore((s) => s.route);
  const navigate = useUiStore((s) => s.navigate);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  return (
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
        {[NAV_PAGES, NAV_TOOLS].map((group, g) => (
          <div key={g} className={g === 0 ? "nav-group" : "nav-group tools"}>
            {group.map((n) => {
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
          </div>
        ))}
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
  );
}

/** The chrome around one page; `children` is the page, which renders its PageFrame. */
export function AppLayout({ children }: { children: ReactNode }) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  return (
    <div className={collapsed ? "shell collapsed" : "shell"}>
      <SkipLink />
      <Sidebar collapsed={collapsed} />
      <div className="content">{children}</div>
    </div>
  );
}
