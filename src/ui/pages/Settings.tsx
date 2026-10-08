import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { SlidersHorizontal, DatabaseBackup } from "lucide-react";
import { useUiStore, type SettingsTab } from "../../state/uiStore";
import { AppShell } from "../components/AppShell";
import { AssumptionsPanel } from "./Assumptions";
import { BackupRestorePanel } from "./BackupRestore";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";

const tabId = (tab: SettingsTab) => `settings-tab-${tab}`;
const PANEL_ID = "settings-panel";

const TABS: {
  tab: SettingsTab;
  key: keyof Dictionary["settings"]["tabs"];
  icon: LucideIcon;
}[] = [
  { tab: "assumptions", key: "assumptions", icon: SlidersHorizontal },
  { tab: "backup", key: "backup", icon: DatabaseBackup },
];

export function SettingsPage() {
  const t = useT();
  const activeTab = useUiStore((s) => s.settingsTab);
  const setSettingsTab = useUiStore((s) => s.setSettingsTab);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // The tab pattern (ADR 0157): one Tab stop on the selected tab; the arrows, Home and
  // End move focus, and Enter or Space switches. Manual activation, because a switch can
  // raise the unsaved-changes guard and moving focus alone must not.
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = TABS.length - 1;
    const to = {
      ArrowDown: i === last ? 0 : i + 1,
      ArrowRight: i === last ? 0 : i + 1,
      ArrowUp: i === 0 ? last : i - 1,
      ArrowLeft: i === 0 ? last : i - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    tabRefs.current[to]?.focus();
  }

  return (
    <AppShell
      title={t.settings.title}
      subtitle={t.settings.subtitle}
      showLens={false}
    >
      <div className="settings-layout">
        <div
          className="settings-subnav"
          role="tablist"
          aria-orientation="vertical"
          aria-label={t.settings.title}
        >
          {TABS.map((s, i) => {
            const Icon = s.icon;
            const label = t.settings.tabs[s.key];
            const active = s.tab === activeTab;
            return (
              <button
                key={s.tab}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={tabId(s.tab)}
                aria-selected={active}
                aria-controls={active ? PANEL_ID : undefined}
                tabIndex={active ? 0 : -1}
                className={active ? "active" : ""}
                onClick={() => setSettingsTab(s.tab)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <div
          className="settings-content"
          role="tabpanel"
          id={PANEL_ID}
          aria-labelledby={tabId(activeTab)}
        >
          {activeTab === "assumptions" && <AssumptionsPanel />}
          {activeTab === "backup" && <BackupRestorePanel />}
        </div>
      </div>
    </AppShell>
  );
}
