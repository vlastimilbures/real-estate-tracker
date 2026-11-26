// The app's chrome around the page: the skip link, the sidebar and the column the
// page's own frame (PageFrame: top bar and main region) fills. PageBoundary renders it once
// while the app is ready, so a page change, a page's code loading and a page error keep
// the sidebar's nodes, its scroll position and the focus in it (ADR 0263).
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useUiStore, type Theme } from "../../state/uiStore";
import { swapShownRoute } from "../../state/shellMemory";
import { usePortfolioStore } from "../../state/portfolioStore";
import { BrandMark } from "./BrandMark";
import { BackupHint } from "./BackupHint";
import { SkipLink } from "./SkipLink";
import { SegmentedToggle } from "./Button";
import { fmtDate } from "../../lib/format";
import { APP_NAME, LANGUAGES } from "../../i18n";
import { NAV_GROUPS, navMarked } from "../routes";
import { useT } from "../hooks/useT";
import { focusLost } from "../focus";
import { at } from "../../lib/arrays";

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
    <SegmentedToggle
      options={LANGUAGES}
      value={language}
      onChange={setLanguage}
      ariaLabel={t.shell.language}
    />
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
    <SegmentedToggle
      className="icons"
      options={THEME_OPTIONS.map((o) => ({
        value: o.value,
        label: t.shell[o.labelKey],
        icon: o.icon,
      }))}
      value={theme}
      onChange={setTheme}
      ariaLabel={t.shell.appearance}
    />
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
        {NAV_GROUPS.map((group, g) => (
          <div key={g} className={g === 0 ? "nav-group" : "nav-group tools"}>
            {group.map((n) => {
              const active = navMarked(route, n.route);
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

/** Whether focus is lost or in the chrome around `content` (the skip link, the sidebar):
 *  the parts a page change does not hand to the new page. */
function focusOffPage(content: HTMLElement): boolean {
  const active = document.activeElement;
  const shell = content.parentElement;
  return (
    focusLost() || (!!shell?.contains(active) && !content.contains(active))
  );
}

/**
 * The column the page fills. After a page change it moves focus to the new page's main
 * region when focus is lost or still in the chrome (the pressed nav button, the skip link),
 * so Tab continues there and a screen reader hears the change (ADR 0146 §4, ADR 0263 §2).
 * Not at startup, and not when the page already placed focus (a dialog, a glossary term,
 * a section). It sits inside the lazy pages' Suspense, so its effect runs when the new page
 * commits, after the page's own effects.
 */
function Content({ children }: { children: ReactNode }) {
  const route = useUiStore((s) => s.route);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The route shown last, kept in module state: the chrome mounts again when the app
    // comes back to the ready state, maybe on another page (ADR 0263).
    const before = swapShownRoute(route);
    const content = ref.current;
    if (before === null || before === route || !content) return;
    if (focusOffPage(content))
      content
        .querySelector<HTMLElement>("#main")
        ?.focus({ preventScroll: true });
  }, [route]);
  return (
    <div className="content" ref={ref}>
      {children}
    </div>
  );
}

/** The chrome around the pages; `children` is the page, which renders its PageFrame.
 *  While a page's code loads, the content column is hidden and the sidebar stays. */
export function AppLayout({ children }: { children: ReactNode }) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  return (
    <div className={collapsed ? "shell collapsed" : "shell"}>
      <SkipLink />
      <Sidebar collapsed={collapsed} />
      <Suspense fallback={null}>
        <Content>{children}</Content>
      </Suspense>
    </div>
  );
}
