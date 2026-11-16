import { useId, useRef } from "react";
import { useUiStore, type SettingsTab } from "../../state/uiStore";
import { AppShell } from "../components/AppShell";
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
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // One draft for the form and the top bar's Save (ADR 0221 §4).
  const form = useAssumptionsForm(activeTab === "assumptions");
  const formId = useId();

  // The tab pattern (ADR 0157, horizontal per ADR 0221): one Tab stop on the selected
  // tab; Left/Right, Home and End move focus, and Enter or Space switches. Manual
  // activation, because a switch can raise the unsaved-changes guard and moving focus
  // alone must not.
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = TABS.length - 1;
    const to = {
      ArrowRight: i === last ? 0 : i + 1,
      ArrowLeft: i === 0 ? last : i - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    tabRefs.current[to]?.focus();
  }

  const tabs = (
    <div
      className="tab-strip"
      role="tablist"
      aria-orientation="horizontal"
      aria-label={t.settings.title}
    >
      {TABS.map((s, i) => {
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
            onClick={() => setSettingsTab(s.tab)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.settings.tabs[s.key]}
          </button>
        );
      })}
    </div>
  );

  // Tabs in the top bar's section row; Save and Discard in its actions on the
  // Assumptions tab (ADR 0221).
  return (
    <AppShell
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
    </AppShell>
  );
}
