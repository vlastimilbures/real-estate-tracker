import { useEffect } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { onMenuEvent, setMenuLabels } from "../../state/platform";
import { isTauri } from "../../lib/tauri";
import { menuLabels, menuRoute } from "../model/menu";
import { useT } from "./useT";

/**
 * The bridge to the native menu (UX-066): App ▸ About…, View ▸ page (⌘1–⌘5), File ▸ New
 * Property… (⌘N) and Settings… (⌘,, UX-074). Ignored while a dialog is open, so a menu key
 * never leaves a form behind or stacks About over it (ADR 0157). They are also ignored while
 * the app is not ready (loading or an error screen), so Try again returns to the page the
 * owner was on, with no About left to pop up (ADR 0228). Guarded by the Tauri check (mirrors
 * src/data/tauriSql.ts) so browser/E2E never crash on the missing event bridge.
 */
export function useNativeMenu(): void {
  const t = useT();

  useEffect(() => {
    if (!isTauri()) return;
    const dialogOpen = () =>
      document.querySelector('[aria-modal="true"]') !== null;
    const held = () =>
      dialogOpen() || usePortfolioStore.getState().status.kind !== "ready";
    const offs = [
      onMenuEvent("menu://about", () => {
        if (!held()) useUiStore.getState().openAbout();
      }),
      onMenuEvent("menu://navigate", (e) => {
        const route = menuRoute(e.payload);
        if (route && !held()) useUiStore.getState().navigate(route);
      }),
      onMenuEvent("menu://new-property", () => {
        if (!held()) useUiStore.getState().requestNewProperty();
      }),
      onMenuEvent("menu://settings", () => {
        if (!held()) useUiStore.getState().openSettings();
      }),
    ];
    return () => {
      for (const off of offs) void off.then((f) => f());
    };
  }, []);

  // The native menu items the app adds follow the UI language (UX-076): sent at start and
  // on every language change (`t` is one dictionary object per language).
  useEffect(() => {
    if (isTauri()) setMenuLabels(menuLabels(t));
  }, [t]);
}
