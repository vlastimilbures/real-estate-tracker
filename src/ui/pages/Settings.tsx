import type { LucideIcon } from "lucide-react";
import { SlidersHorizontal, DatabaseBackup } from "lucide-react";
import { useUiStore, type SettingsTab } from "../../state/uiStore";
import { AppShell } from "../components/AppShell";
import { AssumptionsPanel } from "./Assumptions";
import { BackupRestorePanel } from "./BackupRestore";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";

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

  return (
    <AppShell
      title={t.settings.title}
      subtitle={t.settings.subtitle}
      showLens={false}
    >
      <div className="settings-layout">
        <nav
          className="settings-subnav"
          role="tablist"
          aria-label={t.settings.title}
        >
          {TABS.map((s) => {
            const Icon = s.icon;
            const label = t.settings.tabs[s.key];
            const active = s.tab === activeTab;
            return (
              <button
                key={s.tab}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? "active" : ""}
                onClick={() => setSettingsTab(s.tab)}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="settings-content" role="tabpanel">
          {activeTab === "assumptions" && <AssumptionsPanel />}
          {activeTab === "backup" && <BackupRestorePanel />}
        </div>
      </div>
    </AppShell>
  );
}
