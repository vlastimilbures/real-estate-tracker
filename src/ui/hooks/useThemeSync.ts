import { useEffect } from "react";
import { useUiStore } from "../../state/uiStore";
import { applyTheme, onSystemThemeChange } from "../theme";

/** Keeps <html data-theme> in sync with the preference, and follows the OS while the
 *  preference is "system". */
export function useThemeSync(): void {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    return onSystemThemeChange(() => applyTheme("system"));
  }, [theme]);
}
