import { useId } from "react";
import { useUiStore, type SettingsTab } from "../../state/uiStore";
import { PageFrame } from "../components/PageFrame";
import { Tabs } from "../components/Tabs";
import { AssumptionsPanel, AssumptionsActions } from "./Assumptions";
import { useAssumptionsForm } from "../hooks/useAssumptionsForm";
import { BackupRestorePanel } from "./BackupRestore";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";

const tabId = (tab: SettingsTab) => `settings-tab-${tab}`;
const PANEL_ID = "settings-panel";

const TABS: {
  tab: SettingsTab;
  key: keyof Dictionary["settings"]["tabs"];
}[] = [
  { tab: "assumptions", key: "assumptions" },
  { tab: "backup", key: "backup" },
];

export function SettingsPage() {
  const t = useT();
  const activeTab = useUiStore((s) => s.settingsTab);
  const setSettingsTab = useUiStore((s) => s.setSettingsTab);
  // One draft for the form and the top bar's Save (ADR 0221 §4).
  const form = useAssumptionsForm(activeTab === "assumptions");
  const formId = useId();

  const tabs = (
    <Tabs
      label={t.settings.title}
      tabs={TABS.map((s) => ({ key: s.tab, label: t.settings.tabs[s.key] }))}
      selected={activeTab}
      onSelect={setSettingsTab}
      tabId={tabId}
      panelId={PANEL_ID}
    />
  );

  // Tabs in the top bar's section row; Save and Discard in its actions on the
  // Assumptions tab (ADR 0221).
  return (
    <PageFrame
      title={t.settings.title}
      subtitle={t.settings.subtitle}
      showLens={false}
      subnav={tabs}
      actions={
        activeTab === "assumptions" ? (
          <AssumptionsActions form={form} formId={formId} />
        ) : undefined
      }
    >
      <div
        className="settings-content"
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={tabId(activeTab)}
      >
        {activeTab === "assumptions" && (
          <AssumptionsPanel form={form} formId={formId} />
        )}
        {activeTab === "backup" && <BackupRestorePanel />}
      </div>
    </PageFrame>
  );
}
